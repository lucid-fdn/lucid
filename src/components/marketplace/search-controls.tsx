'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchFilters, AssetKind } from '@/lib/marketplace/types';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SearchControls({ initialFilters }: { initialFilters: SearchFilters }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialFilters.q || '');
  const [kind, setKind] = useState<AssetKind | ''>(initialFilters.kind || '');
  const [euOnly, setEuOnly] = useState(initialFilters.eu_only || false);
  const [ccOn, setCcOn] = useState(initialFilters.cc_on || false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilters({ q: query || undefined });
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once to sync URL params
  }, [query]);

  const updateFilters = useCallback((updates: Partial<SearchFilters>) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    
    // Update params
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === false) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    // Reset cursor on filter change
    params.delete('cursor');

    router.push(`/explore?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <Card className="p-4">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1">
          <Input
            type="search"
            placeholder="Search models, datasets, agents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Kind Filter */}
        <Select
          value={kind || 'all'}
          onValueChange={(value) => {
            const newKind = value === 'all' ? '' : (value as AssetKind);
            setKind(newKind);
            updateFilters({ kind: newKind || undefined });
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="MODEL">Models</SelectItem>
            <SelectItem value="DATASET">Datasets</SelectItem>
            <SelectItem value="AGENT">Agents</SelectItem>
            <SelectItem value="COMPUTE">Compute</SelectItem>
          </SelectContent>
        </Select>

        {/* EU Only Toggle */}
        <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
          <Switch
            id="eu-only"
            checked={euOnly}
            onCheckedChange={(checked) => {
              setEuOnly(checked);
              updateFilters({ eu_only: checked || undefined });
            }}
          />
          <Label htmlFor="eu-only" className="text-sm cursor-pointer">
            🇪🇺 EU Only
          </Label>
        </div>

        {/* CC-On Toggle */}
        <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
          <Switch
            id="cc-on"
            checked={ccOn}
            onCheckedChange={(checked) => {
              setCcOn(checked);
              updateFilters({ cc_on: checked || undefined });
            }}
          />
          <Label htmlFor="cc-on" className="text-sm cursor-pointer">
            🔒 CC-On
          </Label>
        </div>
      </div>

      {/* Active Filters Display */}
      {(initialFilters.q || initialFilters.kind || initialFilters.eu_only || initialFilters.cc_on) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {initialFilters.q && (
            <Badge variant="secondary">
              Search: {initialFilters.q}
            </Badge>
          )}
          {initialFilters.kind && (
            <Badge variant="secondary">
              {initialFilters.kind}
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
