import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForumContext } from "./ForumContext";

type Phase = "idle" | "fade-black" | "text-in" | "fade-out";

export default function ForumTransition() {
  const { showTransition, forumReady } = useForumContext();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!showTransition) {
      setPhase("idle");
      return;
    }

    setPhase("fade-black");

    const t1 = setTimeout(() => setPhase("text-in"), 300);
    const t2 = setTimeout(() => setPhase("fade-out"), 1200);
    const t3 = setTimeout(() => {
      navigate("/forum");
      forumReady();
    }, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [showTransition, navigate, forumReady]);

  if (phase === "idle") return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: "black",
        opacity: phase === "fade-black" ? 1 : phase === "text-in" ? 1 : 0,
        transition: phase === "fade-black" ? "opacity 0.5s ease-in" : "opacity 0.5s ease-out",
      }}
    >
      <h1
        className="select-none pointer-events-none"
        style={{
          fontFamily: "var(--font-display)",
          color: "hsl(var(--gold))",
          fontSize: "clamp(1.5rem, 4vw, 3rem)",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          opacity: phase === "text-in" ? 1 : 0,
          transition: "opacity 0.6s ease-in",
          textShadow: "0 0 40px rgba(212, 168, 67, 0.4), 0 0 80px rgba(212, 168, 67, 0.2)",
        }}
      >
        Civis Romanvs Svm
      </h1>
    </div>
  );
}
