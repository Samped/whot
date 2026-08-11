import { Suspense } from "react";
import { WhotGame } from "@/components/WhotGame";

const Home = () => {
  return (
    <main>
      <Suspense fallback={<div className="app-shell">Dealing…</div>}>
        <WhotGame />
      </Suspense>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>Hands stay sealed until dumped. Base Sepolia.</span>
          <a href="https://docs.inco.org" target="_blank" rel="noreferrer">
            Inco Lightning
          </a>
        </div>
      </footer>
    </main>
  );
};

export default Home;
