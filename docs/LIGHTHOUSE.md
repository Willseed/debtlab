# Lighthouse Policy

Required mobile Lighthouse scores:

```txt
Performance: 90
Accessibility: 100
Best Practices: 100
SEO: 100
```

Short form:

```txt
90 / 100 / 100 / 100
```

Required command:

```bash
pnpm lhci
```

## Performance Budget

Targets:

```txt
Initial JS <= 180KB gzip
Initial CSS <= 40KB gzip
Lazy route chunks <= 120KB gzip each
CLS <= 0.05
LCP <= 2.5s on mobile Lighthouse
TBT <= 200ms
```

## Angular Rules

Use:

1. Route-level lazy loading.
2. Angular deferrable views for non-critical dashboard sections where useful.
3. Explicit image dimensions.
4. Minimal third-party scripts.
5. OnPush change detection where useful.
6. Angular `@for` with tracking expressions.
7. Native HTML/CSS instead of heavy UI kits.

Avoid:

1. Large charting libraries for MVP.
2. External fonts unless Lighthouse remains compliant.
3. Unnecessary third-party scripts.
4. Animations that harm accessibility.
