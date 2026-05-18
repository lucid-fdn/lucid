import { Container } from '@/components/container'
import { Heading, Subheading, Topheading } from '@/components/text-marketing'
import { BentoCard } from './bento-card'
import { BorderBeam } from '@/ui/components/border-beam'
import { AuroraText } from '@/ui/components/aurora-text'

const features = [
  {
    name: 'Digital Nation of 850+ On-Chain AIs',
    description:
      'Your AI, agents, datas & computes are standardized & connected — knowledge flows across apps so results improve everywhere. Powering the next-gen of DeAI applications.',
    eyebrow: 'Everything works together',
  },
  {
    name: 'User-Owned, Portable Memory', 
    description:
      'Your AI remembers across apps and learns from others. Because you own your data, not the app.',
    eyebrow: 'Never start from zero',
  },
  {
    name: 'Ultra-Scalable, Human-Fast',
    description:
      'Human like AI. Answers stream instantly; proofs write in the background—no latency tax.',
    eyebrow: 'Real-Time Speed & Scale',
  },
  {
    name: 'Earn from day one',
    description:
      'We track who contributes (data, models, compute) and split earnings automatically. Stake now!',
    eyebrow: 'AI economy',
  },
  {
    name: '1-click Compliance',
    description:
      'Export receipts for review — regulator-friendly. Key steps are batched on-chain—without exposing data.',
    eyebrow: 'Open Audit Trail',
  }
]


export function WhyItMatter() {
  return (
    <section
      id="secondary-features"
      aria-label="Features for building a portfolio"
      className="py-20 sm:py-32"
    >
      <Container>
        <Topheading dark className="text-center">THE MISSING AI LAYER 2</Topheading>
        <Heading as="h3" dark className="mt-2 max-w-3xl font-semibold text-center mx-auto">
          <AuroraText>Lucid Chain</AuroraText> turns fragmented AIs into Interoperable Citizens.
        </Heading>
        <Subheading dark className="mt-4 max-w-4xl text-center mx-auto text-muted-foreground">
          Web2 is fast but closed. Web3 is open but slow. Both are fragmented. We need interoperability, shared history, checkable receipts, and fair payouts at Web speed.
        </Subheading>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-3 lg:grid-rows-2">
          {features.map((feature, index) => (
            <BentoCard
              key={feature.name}
              dark
              eyebrow={feature.eyebrow}
              title={feature.name}
              description={feature.description}
              className={
                index === 0 ? "max-lg:rounded-t-4xl lg:col-span-2 lg:rounded-tl-4xl" :
                index === 1 ? "lg:col-span-1 lg:rounded-tr-4xl" :
                index === 2 ? "lg:col-span-1 lg:rounded-bl-4xl" :
                index === 3 ? "lg:col-span-1" :
                "max-lg:rounded-b-4xl lg:col-span-1 lg:rounded-br-4xl"
              }
            >
              {index === 0 && <BorderBeam duration={8} size={100} />}
            </BentoCard>
          ))}
        </div>
      </Container>
    </section>
  )
}
