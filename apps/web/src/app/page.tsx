import { MvpBoard } from "@/components/mvp-board";

export default function Home() {
  return (
    <div className="flex flex-1 bg-[linear-gradient(135deg,#eef6ff_0%,#f5fbf2_45%,#fff8eb_100%)]">
      <main className="flex flex-1 py-4 sm:py-6">
        <MvpBoard />
      </main>
    </div>
  );
}
