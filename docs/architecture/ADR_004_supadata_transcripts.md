# ADR 004: Supadata API for Transcript Retrieval

**Status:** In Review
**Date:** 2026-03-24
**Deciders:** Solo Developer
**Related Documents:**
- [ADR 003: Split Transcript Retrieval and Ingredient Enrichment](./ADR_003_split_transcript_enrich.md)

---

## Context

The current enrich function fetches transcripts via a self-hosted microservice (`transcript-microservice.fly.dev`) using residential proxies and the YouTube API. This takes ~7s per response, followed by ~2-3s for Gemini ingredient extraction — pushing total function runtime dangerously close to Netlify's 10s free tier limit.

This leaves no headroom for processing longer videos or adding additional functionality without breaching the timeout threshold.

---

## Decision

Switch from the self-hosted transcript microservice to **Supadata API** for transcript retrieval.

---

## Consequences

### Positive
- Cheaper: Supadata costs $5/month vs. $7/month for the current residential proxy service
- Broader platform support: Supadata handles transcripts for YouTube, Instagram, and TikTok
- No microservice maintenance burden — removes the need to manage and host `transcript-microservice.fly.dev`

### Negative
- No control over continued API support or future pricing changes
- Single point of failure — if Supadata is down, transcript fetching is unavailable
- No visibility into how the API functions internally

### Neutral
- Will need to adopt Supadata's API request/response format going forward
- Supadata uses the same underlying service as the current microservice
