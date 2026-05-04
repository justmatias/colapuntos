import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Types } from 'mongoose';
import { auth } from '@/lib/auth';
import { connectDB } from '@/lib/db/mongoose';
import { Tournament } from '@/lib/models/Tournament';
import { GrandPrix } from '@/lib/models/GrandPrix';
import { Score } from '@/lib/models/Score';
import { RaceResult } from '@/lib/models/RaceResult';
import { User } from '@/lib/models/User';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

const STATUS_ICON: Record<string, string> = {
	completed: '✅',
	closed: '🔒',
	open: '🟢',
	upcoming: '⏳',
};

function computeStatus(
	predictionDeadline: Date,
	raceDate: Date,
	hasResult: boolean,
): string {
	if (hasResult) return 'completed';
	const now = new Date();
	if (predictionDeadline < now) return 'closed';
	const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
	if (predictionDeadline <= in48h) return 'open';
	return 'upcoming';
}

async function getTournamentData(tournamentId: string, userId: string) {
	await connectDB();

	const tournament = await Tournament.findById(tournamentId).lean();
	if (!tournament) return null;

	const objectUserId = new Types.ObjectId(userId);
	const isMember = (tournament.members as Types.ObjectId[]).some(
		(m) => m.toString() === userId,
	);
	if (!isMember) return null;

	const isCreator = tournament.creator.toString() === userId;

	// Members with names
	const memberIds = (tournament.members as Types.ObjectId[]).map(
		(m) => new Types.ObjectId(m.toString()),
	);
	const users = await User.find({ _id: { $in: memberIds } })
		.select('_id name')
		.lean();
	const userMap = new Map(users.map((u) => [u._id.toString(), u.name]));

	// Scores aggregated per member
	const scoreAgg = await Score.aggregate([
		{
			$match: {
				tournament: new Types.ObjectId(tournamentId),
				user: { $in: memberIds },
			},
		},
		{
			$group: {
				_id: '$user',
				total: { $sum: '$points' },
				gpsPlayed: { $sum: 1 },
			},
		},
		{ $sort: { total: -1 } },
	]);

	const leaderboard = scoreAgg.map((s, i) => ({
		rank: i + 1,
		userId: s._id.toString(),
		name: userMap.get(s._id.toString()) ?? '—',
		total: s.total,
		gpsPlayed: s.gpsPlayed,
	}));

	// Members with 0 points (not in scoreAgg)
	const scoredIds = new Set(scoreAgg.map((s) => s._id.toString()));
	for (const m of tournament.members) {
		const mid = m.toString();
		if (!scoredIds.has(mid)) {
			leaderboard.push({
				rank: leaderboard.length + 1,
				userId: mid,
				name: userMap.get(mid) ?? '—',
				total: 0,
				gpsPlayed: 0,
			});
		}
	}

	// Grand Prix list
	const gps = await GrandPrix.find({ season: tournament.season })
		.sort({ round: 1 })
		.lean();

	const gpIds = gps.map((g) => g._id);
	const results = await RaceResult.find({ grandPrix: { $in: gpIds } })
		.select('grandPrix')
		.lean();
	const resultSet = new Set(results.map((r) => r.grandPrix.toString()));

	const gpList = gps.map((gp) => ({
		id: gp._id.toString(),
		round: gp.round,
		name: gp.name,
		country: gp.country,
		circuit: gp.circuit,
		raceDate: gp.raceDate,
		predictionDeadline: gp.predictionDeadline,
		status: computeStatus(
			new Date(gp.predictionDeadline),
			new Date(gp.raceDate),
			resultSet.has(gp._id.toString()),
		),
	}));

	const nextGP = gpList.find(
		(g) => g.status === 'open' || g.status === 'upcoming',
	);

	return {
		tournament: {
			id: tournament._id.toString(),
			name: tournament.name,
			season: tournament.season,
			inviteCode: tournament.inviteCode,
			isCreator,
		},
		leaderboard,
		gpList,
		nextGP,
		currentUserId: userId,
	};
}

export default async function TournamentPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) redirect('/login');

	const data = await getTournamentData(id, session.user.id);
	if (!data) notFound();

	const { tournament, leaderboard, gpList, nextGP } = data;

	return (
		<div className='space-y-8'>
			{/* Header */}
			<div className='flex items-start justify-between gap-4 flex-wrap'>
				<div>
					<h1 className='text-2xl font-bold'>{tournament.name}</h1>
					<p className='text-zinc-400 text-sm mt-0.5'>
						Temporada {tournament.season}
					</p>
				</div>
				<div className='flex items-center gap-2 flex-wrap'>
					{tournament.isCreator && (
						<>
							<Badge className='bg-red-700 text-white text-xs'>Admin</Badge>
							<Link
								href={`/admin/${tournament.id}`}
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Administrar
							</Link>
						</>
					)}
					<div className='flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-mono text-zinc-300'>
						<span className='text-zinc-500 text-xs'>Código:</span>
						<span className='font-semibold tracking-widest'>
							{tournament.inviteCode}
						</span>
					</div>
					{nextGP && (
						<Link
							href={`/tournaments/${tournament.id}/gp/${nextGP.id}/predict`}
							className={cn(
								buttonVariants({ size: 'sm' }),
								'bg-red-600 hover:bg-red-700 text-white',
							)}
						>
							Predecir próxima carrera →
						</Link>
					)}
				</div>
			</div>

			{/* Leaderboard */}
			<section>
				<div className='flex items-center justify-between mb-3'>
					<h2 className='text-lg font-semibold'>Posiciones</h2>
					<Link
						href={`/tournaments/${tournament.id}/leaderboard`}
						className='text-sm text-zinc-400 hover:text-white transition-colors'
					>
						Ver detalle →
					</Link>
				</div>
				<div className='rounded-lg border border-zinc-800 overflow-hidden'>
					<Table>
						<TableHeader>
							<TableRow className='border-zinc-800 hover:bg-transparent'>
								<TableHead className='text-zinc-400 w-12'>#</TableHead>
								<TableHead className='text-zinc-400'>Jugador</TableHead>
								<TableHead className='text-zinc-400 text-right'>GPs</TableHead>
								<TableHead className='text-zinc-400 text-right'>
									Puntos
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{leaderboard.map((row) => (
								<TableRow
									key={row.userId}
									className={`border-zinc-800 ${row.userId === data.currentUserId ? 'bg-zinc-800/50' : ''}`}
								>
									<TableCell className='text-zinc-400 font-mono'>
										{row.rank}
									</TableCell>
									<TableCell className='font-medium text-white'>
										{row.name}
										{row.userId === data.currentUserId && (
											<span className='ml-2 text-xs text-zinc-500'>(vos)</span>
										)}
									</TableCell>
									<TableCell className='text-zinc-400 text-right'>
										{row.gpsPlayed}
									</TableCell>
									<TableCell className='text-right font-bold text-white'>
										{row.total}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</section>

			{/* GP Calendar */}
			<section>
				<h2 className='text-lg font-semibold mb-3'>Calendario</h2>
				<div className='space-y-2'>
					{gpList.map((gp) => (
						<Link
							key={gp.id}
							href={`/tournaments/${tournament.id}/gp/${gp.id}/predict`}
							className='flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-700 transition-colors'
						>
							<span className='text-zinc-600 font-mono text-sm w-6 text-center'>
								{gp.round}
							</span>
							<span className='text-lg'>{STATUS_ICON[gp.status]}</span>
							<div className='flex-1 min-w-0'>
								<p className='font-medium text-white truncate'>{gp.name}</p>
								<p className='text-xs text-zinc-500'>
									{new Date(gp.raceDate).toLocaleDateString('es-AR', {
										day: 'numeric',
										month: 'short',
									})}
									{' — '}
									{gp.circuit}
								</p>
							</div>
							{gp.status === 'open' && (
								<Badge className='bg-green-700/30 text-green-400 border border-green-700/50 text-xs shrink-0'>
									Abierto
								</Badge>
							)}
							{gp.status === 'closed' && (
								<Badge className='bg-zinc-800 text-zinc-400 text-xs shrink-0'>
									Cerrado
								</Badge>
							)}
						</Link>
					))}
				</div>
			</section>
		</div>
	);
}
