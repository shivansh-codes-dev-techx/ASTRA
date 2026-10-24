import "./auth-page.css";
import { ASTRA_API_URL } from "@/lib/astra";

export default function AuthPage() {
  const verificationHash = window.location.hash.startsWith("#verify-email=")
    ? window.location.hash
    : "";

  return (
    <main className="auth-page">
      <iframe
        className="auth-page__frame"
        src={`/auth/index.html${window.location.search}${verificationHash}`}
        onLoad={(event) => {
          event.currentTarget.contentWindow?.postMessage(
            { type: "astra-api-base", baseUrl: ASTRA_API_URL },
            window.location.origin,
          );
        }}
        title="ASTRA login and sign up"
      />
    </main>
  );
}
