"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <p className="font-heading text-3xl tracking-tight text-foreground">Transkrow</p>
      <h1 className="mt-2 font-heading text-4xl leading-none text-foreground">Fetch</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        A private desk for pulling audio and video into transcription. One shared password. Files do not stay.
      </p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use the password set when this service was deployed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/auth/login" method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                className="h-11"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="h-11">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
