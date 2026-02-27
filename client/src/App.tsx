import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthPage } from "@/pages/auth-page";
import { ChatLayout } from "@/pages/chat-layout";
import { useAuth } from "@/hooks/use-auth";
import { CallProvider } from "@/hooks/use-call";
import { CallOverlay } from "@/components/call-overlay";
import { Loader2 } from "lucide-react";

// Wrapper component to handle routing based on Auth state
function RootRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  // If authenticated, any route matches the ChatLayout which handles internal view based on URL params
  return (
    <Switch>
      <Route path="/" component={ChatLayout} />
      <Route path="/chat/:id" component={ChatLayout} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CallProvider>
          <Toaster />
          <CallOverlay />
          <RootRouter />
        </CallProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
