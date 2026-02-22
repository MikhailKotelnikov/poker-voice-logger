# Rules Index

Load this file before any substantial task. Then load only relevant rule files.

## Core Rules

1. [Rule Authoring Standard](./process-rule-authoring-standard.md)
2. [Skill Import from Zip Archives](./process-skill-import-from-zip.md)
3. [HH Pot Math for Raises and Uncalled Returns](./parser-hh-raise-delta-and-uncalled-return.md)
4. [HH Profile Targeting by Actor ID](./process-hh-profile-filter-by-actor-id.md)
5. [HH Append Anchor and Marker](./apps-script-hh-append-anchor-and-marker.md)
6. [Visual Profile Counts Only Target Actions](./visual-profile-target-action-only.md)
7. [HH Local Deterministic Import Without Semantic API](./process-hh-local-deterministic-import.md)
8. [Visual Profile Tooltip Samples and Streets](./visual-profile-tooltip-samples-and-streets.md)
9. [HH Postflop Streets Must Carry Start-Pot Token](./parser-hh-postflop-street-pot-prefix.md)
10. [HH Profile Matching Must Support ID and Text Identity](./process-hh-profile-target-by-identity-or-id.md)
11. [Visual Profile MW Grouping Must Use Actor Count](./visual-profile-mw-by-actor-count.md)
12. [Zip Extraction With Unicode Filenames on macOS](./process-zip-unicode-filenames-with-ditto.md)
13. [HH Uncalled Return Must Not Create Zero-Sized Bets](./parser-hh-uncalled-return-effective-vs-declared-sizing.md)
14. [Visual Profile Tooltip Must Expose All Counted Samples](./visual-profile-sample-count-must-match-bucket-count.md)
15. [Visual Profile Must Separate No-Showdown Strength as Unknown](./visual-profile-no-showdown-use-unknown-strength.md)
16. [Sheets Batch Upload Must Use Timeout and Checkpoint](./process-sheets-batch-upload-timeout-and-checkpoint.md)
17. [Showdown Class Tokens Must Override Unknown In Visual Strength](./visual-profile-showdown-class-must-win-over-unknown.md)
18. [BetBet And BetBetBet Must Be Derived From Street Sequence](./visual-profile-betbet-lines-from-street-sequence.md)
19. [Tooltip Hole Cards Must Be Sorted High-To-Low](./visual-tooltip-hole-cards-desc-sorting.md)
20. [Paired Board Must Downgrade `2p` To Pair Class In HH Notes](./parser-hh-paired-board-two-pair-downgrade.md)
21. [Infer `Lx` And `Sx` Tags From No-Showdown Postflop Outcomes](./parser-hh-infer-lx-sx-no-showdown-tags.md)
22. [BetBet Miss Strength Must Use The Street Where Bet Was Missed](./visual-profile-betbet-miss-strength-from-miss-street.md)
23. [Postflop Sizing Tokens Must Never Round To `b0`/`r0`](./parser-hh-postflop-sizing-must-not-round-to-zero.md)
24. [Visual Strength Is Street-Local Except Lx/Sx Line Overrides](./visual-profile-street-strength-with-lx-sx-line-override.md)
25. [Clarify Gate Before Implementation](./process-clarify-gate-before-implementation.md)
26. [Verify Gate Before Completion](./process-verify-gate-before-completion.md)
27. [Risky Changes Use Worktree And Test-First](./process-risky-change-worktree-and-test-first.md)
28. [Verify Linked Resources After Third-Party Skill Install](./process-skill-install-verify-linked-resources.md)
29. [Visual Class Tags Must Be Parsed From Hand Suffix Tokens](./visual-profile-class-tags-must-parse-from-hand-suffix.md)

## How to Add a Rule

1. Copy `rules/rule-template.md` into a new file named `rules/<category>-<slug>.md`.
2. Fill all required sections.
3. Add the new file to this index with a one-line summary.
