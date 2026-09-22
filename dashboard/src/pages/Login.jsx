import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

// TODO: connect to real auth backend
export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email";
    if (!password) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    // TODO: connect to real auth backend
    localStorage.setItem("codesage_auth", JSON.stringify({ email }));
    navigate("/dashboard/scan");
  };

  // TODO: connect to real OAuth backend
  const googleClicked = () => {
    console.log("Google OAuth clicked");
    localStorage.setItem("codesage_auth", JSON.stringify({ email: "google-user@stub" }));
    toast("Google OAuth stub — signed in");
    navigate("/dashboard/scan");
  };

  return (
    <div className="auth-page">
      <Link to="/" className="brand auth-brand"><span className="brand-mark">⌘</span> CodeSage</Link>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>Welcome back</h1>
        <p className="hint">Sign in to run audits and review fixes.</p>

        <label>Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>

        <label>Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>

        <button type="submit" className="primary-btn big full">Sign in</button>

        <div className="divider"><span>or</span></div>

        <button type="button" className="google-btn" onClick={googleClicked}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <p className="auth-toggle">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
