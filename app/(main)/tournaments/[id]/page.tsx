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
import { GPCountdown } from '@/app/(public)/calendar/GPCountdown';
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

const STATUS_DOT: Record<string, string> = {
	completed: 'bg-zinc-500',
	past: 'bg-zinc-600',
	closed: 'bg-zinc-500',
	open: 'bg-green-500',
	upcoming: 'bg-amber-500',
	cancelled: 'bg-red-900/60',
};

const WEATHER_EMOJI: Record<"dry" | "wet" | "mixed", string> = {
	dry: "☀️",
	wet: "🌧️",
	mixed: "🌦️",
};

const WEATHER_LABEL: Record<"dry" | "wet" | "mixed", string> = {
	dry: "Carrera seca",
	wet: "Carrera mojada",
	mixed: "Carrera mixta",
};

function computeStatus(
	predictionDeadline: Date,
	raceDate: Date,
	hasResult: boolean,
): string {
	if (hasResult) return 'completed';
	const now = new Date();
	// 4-hour buffer after raceDate so a race that just finished doesn't immediately flip to "past"
	if (new Date(raceDate.getTime() + 4 * 60 * 60 * 1000) < now) return 'past';
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
		countryFlag: gp.countryFlag,
		timezone: gp.timezone,
		cancelled: gp.cancelled ?? false,
		weatherCondition: gp.weatherCondition,
		status: computeStatus(
			new Date(gp.predictionDeadline),
			new Date(gp.raceDate),
			resultSet.has(gp._id.toString()),
		),
	}));

	const nextGP = gpList.find(
		(g) => !g.cancelled && (g.status === 'open' || g.status === 'upcoming'),
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
			<div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4'>
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
								<TableHead className='text-zinc-400 text-right hidden sm:table-cell'>GPs</TableHead>
								<TableHead className='text-zinc-400 text-right'>
									Puntos
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{leaderboard.map((row) => {
								const isCurrentUser = row.userId === data.currentUserId;
								return (
									<TableRow
										key={row.userId}
										className={cn(
											'border-zinc-800',
											isCurrentUser
												? 'bg-zinc-800/70 border-l-2 border-l-red-500'
												: '',
										)}
									>
										<TableCell className='font-mono w-12'>
											{row.rank <= 3 ? (
												<span>{['🥇', '🥈', '🥉'][row.rank - 1]}</span>
											) : (
												<span className='text-zinc-600'>{row.rank}</span>
											)}
										</TableCell>
										<TableCell className='font-medium text-white'>
											{row.name}
											{isCurrentUser && (
												<span className='ml-2 text-xs text-zinc-500'>(vos)</span>
											)}
										</TableCell>
										<TableCell className='text-zinc-400 text-right hidden sm:table-cell'>
											{row.gpsPlayed}
										</TableCell>
										<TableCell className='text-right font-bold text-white'>
											{row.total}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			</section>

			{/* GP Calendar */}
			<section>
				<h2 className='text-lg font-semibold mb-3'>Calendario</h2>
				<div className='space-y-2'>
					{gpList.map((gp) => {
						const isNext = nextGP?.id === gp.id;
						const displayStatus = gp.cancelled ? 'cancelled' : gp.status;
						const raceDate = new Date(gp.raceDate).toLocaleDateString('es-AR', {
							day: 'numeric',
							month: 'short',
						});

						const topLine = (
							<div className='flex items-center gap-3 min-w-0'>
								<span className='text-zinc-600 font-mono text-xs w-5 shrink-0 text-center'>
									{gp.round}
								</span>
								<span
									className={cn(
										'w-2 h-2 rounded-full shrink-0',
										STATUS_DOT[displayStatus],
									)}
								/>
								{gp.countryFlag && (
									<img
										src={gp.countryFlag}
										alt={gp.country}
										className={cn(
											'w-4 h-3 object-cover rounded-sm shrink-0',
											gp.cancelled && 'grayscale',
										)}
									/>
								)}
								<p
									className={cn(
										'font-medium truncate flex-1',
										gp.cancelled
											? 'text-zinc-500 line-through'
											: 'text-white',
									)}
								>
									{gp.name}
								</p>
								{!gp.cancelled && gp.weatherCondition && (
									<span
										className='text-sm shrink-0'
										title={WEATHER_LABEL[gp.weatherCondition as 'dry' | 'wet' | 'mixed']}
									>
										{WEATHER_EMOJI[gp.weatherCondition as 'dry' | 'wet' | 'mixed']}
									</span>
								)}
								<div className='shrink-0 ml-1 flex items-center gap-2'>
									{gp.cancelled && (
										<Badge className='bg-red-950/50 text-red-400/70 border border-red-900/40 text-xs'>
											Cancelado
										</Badge>
									)}
									{!gp.cancelled && gp.status === 'open' && (
										<Badge className='bg-green-700/30 text-green-400 border border-green-700/50 text-xs hidden sm:inline-flex'>
											Abierto
										</Badge>
									)}
									{!gp.cancelled && isNext && gp.status === 'upcoming' && (
										<GPCountdown
											deadline={new Date(gp.predictionDeadline).toISOString()}
											timezone={gp.timezone}
										/>
									)}
									{!gp.cancelled && !isNext && gp.status === 'upcoming' && (
										<Badge className='bg-zinc-800 text-zinc-600 text-xs hidden sm:inline-flex'>
											Próximo
										</Badge>
									)}
									{!gp.cancelled && gp.status === 'past' && (
										<Badge className='bg-zinc-800 text-zinc-500 text-xs hidden sm:inline-flex'>
											Sin resultado
										</Badge>
									)}
									{!gp.cancelled && gp.status === 'closed' && (
										<Badge className='bg-zinc-800 text-zinc-400 text-xs hidden sm:inline-flex'>
											Cerrado
										</Badge>
									)}
									{!gp.cancelled && gp.status === 'completed' && (
										<Badge className='bg-zinc-800 text-zinc-400 text-xs hidden sm:inline-flex'>
											Completado
										</Badge>
									)}
								</div>
							</div>
						);

						const bottomLine = (
							<p className='text-xs text-zinc-600 mt-0.5 pl-8'>
								{raceDate} · {gp.circuit}
							</p>
						);

						if (gp.cancelled) {
							return (
								<div
									key={gp.id}
									className='flex flex-col rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-4 py-3 opacity-60'
								>
									{topLine}
									{bottomLine}
								</div>
							);
						}

						return (
							<Link
								key={gp.id}
								href={`/tournaments/${tournament.id}/gp/${gp.id}/predict`}
								className={cn(
									'flex flex-col rounded-lg border px-4 py-3 transition-colors cursor-pointer',
									isNext
										? 'border-amber-700/60 bg-amber-950/20 hover:border-amber-600/60'
										: 'border-zinc-800 bg-zinc-900 hover:border-zinc-700',
								)}
							>
								{topLine}
								{bottomLine}
							</Link>
						);
					})}
				</div>
			</section>
		</div>
	);
}
