import "./auth-page.css";
export default function AuthPage() {
  return (
    <main className="auth-page">
      <iframe
        className="auth-page__frame"
        src="/auth/index.html"
        title="ASTRA login and sign up"
      />
    </main>
  );
}
