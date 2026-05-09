import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MCPShowcase } from "@/components/landing/MCPShowcase";
import { CTA } from "@/components/landing/CTA";
import { PriceTicker } from "@/components/PriceTicker";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      <div className="aurora-bg" />
      <div className="bg-grid bg-grid-fade pointer-events-none fixed inset-0 -z-10 opacity-30" />

      <Navbar />

      <main className="flex-1">
        <Hero />
        <PriceTicker />
        <FeatureGrid />
        <HowItWorks />
        <MCPShowcase />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
