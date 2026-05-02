import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-64 text-center">
        <p className="text-6xl font-bold text-muted-foreground/30 mb-4">404</p>
        <p className="text-muted-foreground mb-6">Page not found</p>
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </div>
    </Layout>
  );
}
