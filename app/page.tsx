import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Users, Trophy, BarChart2 } from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Crea o Únete",
    description:
      "Crea un torneo privado y comparte el código de invitación con tus amigos.",
  },
  {
    icon: Trophy,
    title: "Predice el Podio",
    description:
      "Elige el P1, P2 y P3 antes del cierre de cada fin de semana de carrera.",
  },
  {
    icon: BarChart2,
    title: "Suma Puntos",
    description:
      "Gana puntos por aciertos exactos o por pilotos en el podio. Sigue la tabla de posiciones.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-7 h-7">
            <path d="M 76 15 H 43 A 35 35 0 0 0 8 50 A 35 35 0 0 0 43 85 H 76 L 61 60 H 43 A 10 10 0 0 1 33 50 A 10 10 0 0 1 43 40 H 61 Z" fill="#DC2626" />
            <path fill="#FAFAFA" d="M 64 42 h 8 l -2 8 h -8 z M 84 42 h 8 l -2 8 h -8 z M 72 50 h 8 l -2 8 h -8 z" />
          </svg>
          <span className="font-bold text-lg tracking-tight">
            Cola<span className="text-red-500">puntos</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-zinc-300 hover:text-white hover:bg-zinc-800")}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className={cn(buttonVariants({ size: "sm" }), "bg-red-600 hover:bg-red-700 text-white")}
          >
            Registrarse
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center text-center px-6 py-28 gap-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-red-500 border border-red-800 bg-red-950/40 px-3 py-1 rounded-full">
          Temporada F1 2025
        </span>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-2xl leading-tight">
          Demuestra que sabes más de F1 que tus amigos
        </h1>
        <p className="text-lg text-zinc-400 max-w-md">
          Crea torneos privados, predice los podios de cada Gran Premio y compite
          por la gloria en la temporada 2025.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          <Link
            href="/register"
            className={cn(buttonVariants({ size: "lg" }), "bg-red-600 hover:bg-red-700 text-white font-semibold px-8")}
          >
            Empezar a jugar
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Ya tengo cuenta
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-24 max-w-5xl mx-auto w-full">
        <h2 className="text-center text-2xl font-bold tracking-tight mb-10 text-zinc-100">
          ¿Cómo funciona?
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="bg-zinc-900 border-zinc-800 text-white"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-red-950 border border-red-900 mb-3">
                  <Icon className="w-5 h-5 text-red-400" />
                </div>
                <CardTitle className="text-base text-white">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-zinc-400 text-sm leading-relaxed">
                  {description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 px-6 text-center space-y-1">
        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} Colapuntos · Todos los derechos reservados.
        </p>
        <p className="text-xs text-zinc-600">
          Proyecto no oficial. No afiliado a Formula 1 ni a Formula One Management Ltd.
        </p>
      </footer>
    </main>
  );
}
