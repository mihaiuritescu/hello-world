---
name: self-review
description: Run the multi-agent code review from REVIEW.md on the codebase or a commit range, and write docs/review/report.md. Use for the final review before a release, or to review a slice's commits.
argument-hint: "[git range, e.g. v0.9.0..HEAD; default: the whole codebase]"
---

# Self-review

Run the process in `REVIEW.md` exactly, then stop. Fixing findings and triaging them are separate, human-led steps.

1. **Scope.** Record:
   - the commit (`git rev-parse --short HEAD`);
   - the range from the arguments, or "whole codebase";
   - today's date.
2. **Gates.** Run `pnpm verify` and `pnpm test:e2e`, and record each result. Every failing gate becomes an S1 finding.
3. **Review.** In a single message, launch the four lens agents so they run in parallel: `review-correctness`, `review-security`, `review-maintainability`, `review-tests-docs`. Give each one:
   - the scope;
   - the gate results;
   - an instruction to follow `REVIEW.md`.
4. **Deduplicate.** Merge findings that share a file and overlapping lines (±3), keeping the higher severity. Number them REV-01, REV-02 and so on, most severe first.
5. **Verify.** Launch `review-verifier` once per finding, giving it only that finding:
   - **S1:** three independent verifiers; the majority verdict wins.
   - **S2 and S3:** one verifier.
   - **S4:** not verified; keep at most five.

   Record each verdict and vote count. Refuted findings move to the appendix, with the reason.
6. **Report.** Write `docs/review/report.md` from the `REVIEW.md` template, including the funnel (raw → deduplicated → confirmed / plausible / refuted) and the limits of the review.

   For a delta review of fix commits, write `docs/review/report-delta.md` instead.
7. **Hand over.** Summarise the confirmed and plausible findings in chat and stop. Don't fix anything, and don't write `triage.md`: a human decides what to fix.
