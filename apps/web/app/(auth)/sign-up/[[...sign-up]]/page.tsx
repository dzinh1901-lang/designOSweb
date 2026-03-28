import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Launch your first cinematic workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Studio name</Label><Input placeholder="Bluebird Studio" /></div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="you@studio.com" /></div>
          <div className="space-y-2"><Label>Password</Label><Input type="password" /></div>
          <Button className="w-full">Create account</Button>
          <p className="text-sm text-muted-foreground">Have an account? <Link href="/sign-in" className="text-primary">Sign in</Link></p>
        </CardContent>
      </Card>
    </main>
  );
}
