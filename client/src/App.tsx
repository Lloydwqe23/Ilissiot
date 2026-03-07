import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthPage } from "@/pages/auth-page";
import { ChatLayout } from "@/pages/chat-layout";
import { InviteLinkPage } from "@/pages/invite-link-page";
import { useAuth } from "@/hooks/use-auth";
import { CallProvider } from "@/hooks/use-call";
import { CallOverlay } from "@/components/call-overlay";
import { Loader2 } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";

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

  // Invite link route is accessible without authentication
  return (
    <Switch>
      <Route path="/invite/:token" component={InviteLinkPage} />
      {!isAuthenticated ? (
        <Route component={AuthPage} />
      ) : (
        <>
          <Route path="/" component={ChatLayout} />
          <Route path="/chat/:id" component={ChatLayout} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

// component to apply user preference to theme provider
function ThemeInitializer() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  useEffect(() => {
    const appearanceClasses = ['light', 'dark', 'greenish', 'yellowish', 'blueish', 'purpleish', 'pinkish', 'orangeish'];
    const colorThemeClasses = ['theme-blue', 'theme-green', 'theme-red', 'theme-gold', 'theme-purple', 'theme-pink', 'theme-teal', 'theme-orange', 'theme-indigo'];
    const fontClasses = ['font-inter', 'font-poppins', 'font-lora', 'font-jetbrains', 'font-nunito', 'font-merriweather', 'font-manrope', 'font-playfair'];
    const textSizeClasses = ['text-size-small', 'text-size-normal', 'text-size-large'];

    // Apply appearance theme to root element
    if (user?.theme) {
      document.documentElement.classList.remove(...appearanceClasses);
      document.documentElement.classList.add(user.theme);
      // Also set next-themes for dark class if theme is dark
      if (user.theme === 'dark') {
        setTheme('dark');
      } else {
        setTheme('light');
      }
    }
    // Apply color theme class if user has one
    if (user?.colorTheme) {
      document.documentElement.classList.remove(...colorThemeClasses);
      document.documentElement.classList.add(`theme-${user.colorTheme}`);
    }

    // Apply global font style
    document.documentElement.classList.remove(...fontClasses);
    document.documentElement.classList.add(`font-${user?.fontType || 'inter'}`);

    // Apply global text size scale
    document.documentElement.classList.remove(...textSizeClasses);
    document.documentElement.classList.add(`text-size-${user?.textSize || 'normal'}`);
  }, [user, setTheme]);
  return null;
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CallProvider>
            <ThemeInitializer />
            <Toaster />
            <CallOverlay />
            <RootRouter />
          </CallProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
