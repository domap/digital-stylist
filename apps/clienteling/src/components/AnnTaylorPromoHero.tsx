import clientelingPromoBanner from "@/assets/clienteling-promo-banner.svg";
import { cn } from "@/lib/utils";

type AnnTaylorPromoHeroProps = {
  className?: string;
};

export function AnnTaylorPromoHero({ className }: AnnTaylorPromoHeroProps) {
  return (
    <figure className={cn("rounded-2xl overflow-hidden border border-border/70 bg-[#0f1729] shadow-sm shrink-0", className)}>
      <img
        src={clientelingPromoBanner}
        alt="Ann Taylor — Style for every story: new season styles, in-store associate styling and offers, and the valued client program."
        className="w-full h-auto block max-h-[min(48vh,560px)] md:max-h-[min(52vh,620px)] object-cover object-[center_15%] sm:object-center"
        width={1024}
        height={360}
        loading="eager"
        decoding="async"
      />
      <figcaption className="sr-only">
        Promotional banner for new arrivals, in-store styling sessions, and loyalty membership.
      </figcaption>
    </figure>
  );
}
