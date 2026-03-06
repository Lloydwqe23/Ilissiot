import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Shield, Zap, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Login failed");
        return;
      }

      window.location.href = "/";
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (registerForm.password !== registerForm.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const normalizedUsername = registerForm.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
      setError("Username must be 3-32 chars: a-z, 0-9, _");
      return;
    }

    if (registerForm.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: registerForm.email,
          username: normalizedUsername,
          password: registerForm.password,
          firstName: registerForm.firstName || null,
          lastName: registerForm.lastName || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Registration failed");
        return;
      }

      window.location.href = "/";
    } catch (err) {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left Panel - Branding */}
      <div className="md:w-1/2 bg-primary p-8 md:p-16 flex flex-col justify-between relative overflow-hidden text-primary-foreground">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom_right,transparent,rgba(0,0,0,0.2))] z-0" />

        {/* Abstract shapes */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-black/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <img 
              src="/favicon.png" 
              alt="Ilissiot" 
              className="w-12 h-12 rounded-xl"
            />
            <h1 className="text-3xl font-display font-bold text-white">Ilissiot</h1>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6 max-w-lg"
          >
            <h2 className="text-4xl md:text-5xl font-display font-bold leading-tight text-white">
              Connect securely.<br />Communicate freely.
            </h2>
            <p className="text-lg text-primary-foreground/80 leading-relaxed">
              Experience lightning-fast messaging with modern encryption. Ilissiot is designed for those who value privacy without compromising on design.
            </p>
          </motion.div>
        </div>

        <div className="relative z-10 mt-16 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex items-start gap-4">
            <Shield className="w-6 h-6 text-white/80 mt-1" />
            <div>
              <h3 className="font-semibold text-white">Secure by default</h3>
              <p className="text-sm text-primary-foreground/70 mt-1">Your conversations belong to you.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Zap className="w-6 h-6 text-white/80 mt-1" />
            <div>
              <h3 className="font-semibold text-white">Lightning fast</h3>
              <p className="text-sm text-primary-foreground/70 mt-1">Real-time sync across all devices.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Forms */}
      <div className="md:w-1/2 flex items-center justify-center p-8 md:p-16 relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-display font-bold tracking-tight text-foreground">
              {mode === "login" ? "Welcome back" : "Join Ilissiot"}
            </h2>
            <p className="text-muted-foreground">
              {mode === "login"
                ? "Sign in to continue to your account"
                : "Create an account to get started"}
            </p>
          </div>

          <Card className="p-8 space-y-6 border border-border/50">
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                {error}
              </div>
            )}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={loginForm.email}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-base font-semibold rounded-lg"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Sign In
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="your@email.com"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="username"
                      value={registerForm.username}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={registerForm.firstName}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          firstName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={registerForm.lastName}
                      onChange={(e) =>
                        setRegisterForm({
                          ...registerForm,
                          lastName: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="••••••••"
                    value={registerForm.password}
                    onChange={(e) =>
                      setRegisterForm({
                        ...registerForm,
                        password: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={registerForm.confirmPassword}
                    onChange={(e) =>
                      setRegisterForm({
                        ...registerForm,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-base font-semibold rounded-lg"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              </form>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card text-muted-foreground">
                  {mode === "login" ? "or " : ""}
                  {mode === "login" ? (
                    <>
                      Don't have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("register");
                          setError("");
                        }}
                        className="text-primary font-semibold hover:underline"
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setError("");
                        }}
                        className="text-primary font-semibold hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
