import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back to DesignOS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="you@studio.com" /></div>
          <div className="space-y-2"><Label>Password</Label><Input type="password" /></div>
          <Button className="w-full">Continue</Button>
          <p className="text-sm text-muted-foreground">Need an account? <Link href="/sign-up" className="text-primary">Sign up</Link></p>
        </CardContent>
      </Card>
    </main>
  );
}
