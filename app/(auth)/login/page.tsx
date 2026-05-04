import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Link href="/" className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8">
              <path d="M 76 15 H 43 A 35 35 0 0 0 8 50 A 35 35 0 0 0 43 85 H 76 L 61 60 H 43 A 10 10 0 0 1 33 50 A 10 10 0 0 1 43 40 H 61 Z" fill="#DC2626" />
              <path fill="#FAFAFA" d="M 64 42 h 8 l -2 8 h -8 z M 84 42 h 8 l -2 8 h -8 z M 72 50 h 8 l -2 8 h -8 z" />
            </svg>
            <span className="font-bold text-xl tracking-tight text-white">
              Cola<span className="text-red-500">puntos</span>
            </span>
          </Link>
        </div>

        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-extrabold tracking-tight text-white">
              Iniciá sesión
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Ingresá tus credenciales para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
