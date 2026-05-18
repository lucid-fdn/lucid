"use client";
import React from "react";
import { Container } from "./container";
import { Heading } from "./heading";
import { ShimmerText } from "./shimmer-text";
import { SubHeading } from "./subheading";
import { Button } from "./button";
import { Badge } from "./badge";
import Link from "next/link";

export const Hero = () => {
  return (
    <Container className="border-divide my-8 flex flex-col items-center justify-center border-x px-4 pt-10 pb-10 md:my-12 md:pt-32 md:pb-20">
      <Badge text="The Open-Source OS for autonomous agents" />
      <Heading className="mt-4">
        Ship <span className="text-brand">AI teams</span> in one click
      </Heading>

      <SubHeading className="mx-auto mt-6 max-w-3xl text-base md:text-lg">
        Deploy autonomous agents that work together — without building infrastructure
      </SubHeading>

      <div className="mt-6 flex items-center gap-4">
        <Button as={Link} href="/sign-up">
          Start building
        </Button>
        <Button variant="secondary" as={Link} href="/pricing">
          View pricing
        </Button>
      </div>
    </Container>
  );
};
