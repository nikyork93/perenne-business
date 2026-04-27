'use client';

import { useState } from 'react';
import {
  GlassPanel,
  Button,
  Input,
  Textarea,
  Slider,
  ColorPicker,
  SectionLabel,
  Whisper,
  Badge,
  Stat,
} from '@/components/ui';

/**
 * /design — internal design system showcase.
 * Useful for visual verification during development.
 * Not linked from anywhere; remove or protect in production.
 */
export default function DesignSystemPage() {
  const [color, setColor] = useState('#1a1a1a');
  const [slider, setSlider] = useState(50);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto space-y-8">
      <header>
        <div className="label mb-2">Internal</div>
        <h1 className="font-display italic text-5xl leading-none tracking-tight">
          Design System
        </h1>
        <p className="mt-3 text-ink-dim">
          All reusable Liquid Glass components for Perenne Business.
        </p>
      </header>

      {/* ── Buttons ─────────────────────────────────────── */}
      <GlassPanel animate padding="lg">
        <SectionLabel>Buttons</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="mt-4">
          <Button variant="upload">+ Upload something</Button>
        </div>
      </GlassPanel>

      {/* ── Inputs ──────────────────────────────────────── */}
      <GlassPanel animate padding="lg">
        <SectionLabel>Inputs</SectionLabel>
        <div className="grid grid-cols-2 gap-5">
          <Input label="Company name" placeholder="Acme Corp" />
          <Input label="VAT Number" placeholder="IT12345678901" mono />
          <Input label="With error" error="This field is required" />
          <Input label="With hint" hint="optional" placeholder="PEC" />
        </div>
        <div className="mt-5">
          <Textarea label="Email body" placeholder="Write something…" />
        </div>
      </GlassPanel>

      {/* ── Sliders & ColorPicker ───────────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        <GlassPanel animate padding="lg">
          <SectionLabel>Slider</SectionLabel>
          <Slider
            label="Scale"
            displayValue={`${slider}%`}
            min={10}
            max={200}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
          />
          <div className="mt-5">
            <Slider label="Rotation" displayValue="0°" min={-180} max={180} defaultValue={0} />
          </div>
        </GlassPanel>

        <GlassPanel animate padding="lg">
          <ColorPicker label="Cover background" value={color} onChange={setColor} />
          <div
            className="mt-4 h-20 rounded-lg border border-glass-border"
            style={{ background: color }}
          />
        </GlassPanel>
      </div>

      {/* ── Badges ──────────────────────────────────────── */}
      <GlassPanel animate padding="lg">
        <SectionLabel>Badges</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Revoked</Badge>
          <Badge tone="accent">Pro</Badge>
          <Badge tone="info">New</Badge>
        </div>
      </GlassPanel>

      {/* ── Stat cards ──────────────────────────────────── */}
      <div>
        <SectionLabel className="px-1">Stat cards</SectionLabel>
        <div className="grid grid-cols-4 gap-3.5">
          <Stat label="Total codes" value="250" hint="across 3 orders" />
          <Stat label="Claimed" value="138" delta={{ value: '+22 this week', positive: true }} />
          <Stat label="Available" value="112" hint="ready to distribute" />
          <Stat label="Revenue" value="€1,797" delta={{ value: '+€319', positive: true }} />
        </div>
      </div>

      {/* ── Typography ──────────────────────────────────── */}
      <GlassPanel animate padding="lg">
        <SectionLabel>Typography</SectionLabel>
        <div className="space-y-4">
          <h1 className="font-display italic text-5xl tracking-tight">Display · Fraunces italic</h1>
          <h2 className="font-display text-3xl tracking-tight">Display · Fraunces regular</h2>
          <p className="text-sm text-ink">Body · Geist regular — the quick brown fox jumps over the lazy dog.</p>
          <p className="text-xs font-mono text-ink-dim">Mono · Geist Mono — 1234567890 · #d4a574</p>
          <Whisper>Whisper — subtle empty-state voice in italic.</Whisper>
        </div>
      </GlassPanel>
    </main>
  );
}
