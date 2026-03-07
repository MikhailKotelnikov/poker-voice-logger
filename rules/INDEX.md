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
30. [HH Recalculation Must Produce Run-Scoped Artifacts](./process-hh-recalc-run-scoped-artifacts.md)
31. [Visual Semantic Colors On Dark Bars Must Be Opaque](./visual-profile-semantic-colors-on-dark-bars-must-be-opaque.md)
32. [Raise-Multiplier Tokens Must Not Map To Sizing Buckets](./visual-profile-raise-multiplier-must-not-map-to-sizing-bucket.md)
33. [Board Context Tags Must Use Compact Marker Tokens](./parser-hh-board-context-tags-must-use-compact-markers.md)
34. [Visual Miss Check-Fold Lines Must Map To Lx](./visual-profile-miss-check-fold-must-map-to-lx.md)
35. [Propagate Target Lx Tags To Earlier Streets In HH Notes](./parser-hh-propagate-target-lx-to-earlier-streets.md)
36. [Paired-Board Three-Of-A-Kind Must Be Tagged As tri, Not set](./parser-hh-paired-board-three-kind-must-be-tri.md)
37. [Showdown Overpair Must Use `ov` Base Class With Optional `_p` Modifier](./parser-hh-overpair-must-be-explicit-ov-p.md)
38. [HH Reupload After Sheet Reset Must Start From Zero](./process-hh-reupload-after-sheet-reset-start-from-zero.md)
39. [Sheets Append Retry Needs Idempotency Check](./process-sheets-append-retry-needs-idempotency-check.md)
40. [HH Storage Mode Must Separate Write Targets and Profile Read Source](./process-hh-storage-mode-dual-write-read-source.md)
41. [HH Zip Backfill To DB Must Use Deterministic Parser Pipeline](./process-hh-zip-import-to-db-deterministic.md)
42. [Visual Profile Cache Key Must Include Source Scope](./visual-profile-cache-key-must-include-source.md)
43. [HH Pipeline Must Be DB-Only (No Sheet2 Coupling)](./process-hh-db-only-without-sheet2.md)
44. [HH Folder Import Must Preserve Tree and Dedupe by Hand Identity](./process-hh-folder-import-preserve-tree-and-dedupe.md)
43. [HH DB Backfill Must Track Empty Hands Separately From Failures](./process-hh-db-backfill-skip-empty-without-failure.md)
45. [Desktop Launcher Must Persist Runtime Config And Bootstrap HH DB](./process-desktop-launcher-runtime-config-and-db-bootstrap.md)
46. [HH Folder Import Must Prune Empty Input Directories After Move](./process-hh-folder-import-prune-empty-directories.md)
47. [Opponent Suggestions Must Include HH DB Without Sheets Dependency](./process-opponent-suggestions-merge-db-with-sheets.md)
48. [HH OneDrive Inbox Must Stage Into Local Import Before DB Conversion](./process-hh-onedrive-stage-to-local-before-import.md)
49. [HH OneDrive Pipeline Must Archive Imported Files Outside Project Workspace](./process-hh-onedrive-archive-imported-outside-workspace.md)
50. [Visual Profile Cache Key Must Include Active Filters](./visual-profile-cache-key-must-include-active-filters.md)
51. [HH Limit Filter Must Match On Numeric SB/BB, Not Raw Header Text](./process-hh-limit-filter-must-use-sb-bb.md)
52. [HH DB Must Auto-Migrate Legacy Schema Before Profile/Import Queries](./process-hh-db-auto-migrate-legacy-schema.md)
53. [HH Import And Profile Endpoints Must Emit Runtime JSONL Logs](./process-hh-import-and-profile-runtime-jsonl-logging.md)
54. [HH Flush Tier Must Rank By Top Suited Hole Card With Straight-Flush Offset](./parser-hh-flush-tier-must-rank-by-top-suited-hole-with-straight-flush-offset.md)
55. [BetBet Miss Requires Explicit Turn Action](./visual-profile-betbet-miss-requires-turn-action.md)
56. [Turn BetBet Miss Requires Flop Bet Then Turn Check](./visual-profile-turn-betbet-miss-requires-flop-bet-then-turn-check.md)
57. [River Lines Must Split XBB and BXB With Dedicated Donk Rows](./visual-profile-river-lines-must-split-xbb-bxb-with-donk-rows.md)
58. [VS Filter Must Require Shared Active Involvement](./visual-profile-vs-filter-must-require-shared-active-involvement.md)
59. [List Mode Must Reuse Chart Filter Scope and Newest-First Ordering](./visual-profile-list-mode-must-reuse-chart-filter-scope.md)
60. [VS Filter Must Be Validated At Stat Anchor Street](./visual-profile-vs-filter-must-anchor-to-stat-street.md)
61. [HH Game-Card Filter Must Fallback to `game_type`](./process-hh-game-card-filter-fallback-from-game-type.md)
62. [Visual Profile All-In Must Use Dedicated Lane](./visual-profile-all-in-must-use-dedicated-lane.md)
63. [Probe Miss Must Track Flop Check-Through Turn Spot](./visual-profile-probe-miss-must-track-check-through-turn.md)
64. [Tooltip Samples Must Preserve HH Meta](./visual-tooltip-samples-must-preserve-hh-meta.md)
65. [Visual All-In Lane Must Use Anchor Action, Not Any Street All-In](./visual-profile-all-in-lane-must-use-anchor-action.md)
66. [HH Manual Observations Must Survive HH Clears](./process-hh-manual-observations-must-survive-hh-clears.md)
67. [Visual Profile Meta Must Not Coerce Null To Zero](./visual-profile-meta-must-not-coerce-null-to-zero.md)
68. [HH Parser Must Default Omaha Pot Limit To PLO4](./process-hh-parser-omaha-pot-limit-defaults-to-plo4.md)
69. [Visual Tooltip Interactive Mode Must Support Pin](./visual-tooltip-interactive-mode-must-support-pin.md)
70. [HH Manual Fields Must Use Enter-Save And Inline Mic](./visual-hh-manual-fields-enter-save-inline-mic.md)
71. [Visual Tooltip Manual Inputs Must Override Global Text Input Style](./visual-tooltip-manual-input-must-override-global-text-style.md)
72. [HH Manual Join Must Use Selected Target Identity](./process-hh-manual-joins-must-use-selected-target-identity.md)
73. [Pinned Tooltip Edits Must Sync Source Sample Payload](./visual-tooltip-pinned-edits-must-sync-sample-payload.md)
74. [HH Clear Opponent Must Match Profile Selection Predicate](./process-hh-clear-opponent-must-match-profile-selection.md)
75. [Visual Tooltip Readonly Mode Must Show Saved Timings](./visual-tooltip-readonly-must-show-saved-timings.md)
76. [Visual List Mode Must Hide Empty Timing Controls And Fit Viewport](./visual-list-mode-must-hide-empty-timing-controls-and-fit-viewport.md)
77. [HH Manual Presupposition Fields Must Offer Click Presets](./visual-hh-manual-presup-fields-must-offer-presets.md)
78. [Profile VS-Me Filter Must Use Room-Scoped My Nickname](./visual-profile-vs-me-must-use-room-scoped-my-nickname.md)
79. [HH Preset Selection Must Commit On Pointerdown](./visual-hh-presets-must-commit-on-pointerdown.md)
80. [HH Card Visibility Must Distinguish Showdown vs Dealt Source](./process-hh-cards-visibility-showdown-vs-dealt.md)
81. [HH Target Identity Must Strip Position Prefix Tokens](./process-hh-target-identity-must-strip-actor-prefix.md)
82. [Visual Miss Rows Must Mark Target Call-Off All-Ins In All-In Lane](./visual-profile-miss-allin-must-include-target-call-commitment.md)
83. [HH Manual Inputs Must Roll Back Optimistic Values On Save Failure](./visual-hh-manual-optimistic-input-must-rollback-on-save-error.md)
84. [Tooltip Manual Edits Must Patch In-Memory Profile Caches](./visual-tooltip-manual-edits-must-sync-profile-caches.md)
85. [HH Manual Concurrent Saves Must Patch Only The Edited Field](./visual-hh-manual-concurrent-saves-must-patch-field-locally.md)
86. [Tooltip Sample Array Reference Must Stay Stable During Live Patch](./visual-tooltip-sample-array-reference-must-stay-stable.md)

87. [HH Baseline/Quality Servers Must Use Isolated Runtime Paths](./process-hh-dual-server-ab-isolation.md)
88. [Promoting Experimental Server To Main Must Archive Previous Entrypoints](./process-server-promotion-must-archive-previous-entrypoints.md)

89. [HH Room For CPR Families Must Be Derived From Table Token](./process-hh-room-from-table-for-cpr-families.md)
90. [HH Room For Phenom Poker Must Be Derived From Header Line](./process-hh-room-from-header-for-phenom.md)
91. [HH Header Timezone Must Be Converted To UTC](./process-hh-header-timezone-must-convert-to-utc.md)

92. [Video-HH Wave 1 Must Freeze Contract And Labeled Baseline Before Extractor Logic](./process-video-hh-wave1-contract-and-labeled-baseline-first.md)

93. [Video-HH Decode Must Fallback From AVFoundation To Python OCR Stack](./process-video-hh-decode-fallback-from-avfoundation-to-python-ocr.md)

94. [Video-HH Action-Only OCR Must Suppress Bottom Buttons And Dedupe By Pot-Stable Overlay](./process-video-hh-action-only-noise-control-with-pot-aware-dedupe.md)

95. [Video-HH Runs Must Produce Event-To-Frame Preview For Human Verification](./process-video-hh-run-preview-must-map-events-to-frames.md)

96. [Video-HH Player State Must Block Actions After Fold In Same Hand](./process-video-hh-player-state-must-block-actions-after-fold.md)

97. [Video-HH Turn Indicator Must Gate Action Assignment To Active Actor](./process-video-hh-turn-indicator-must-prioritize-active-actor.md)

98. [Video-HH Action Timestamp Must Anchor To Onset Frame](./process-video-hh-action-timestamp-must-anchor-to-onset-frame.md)

99. [Video-HH Preflop Squeeze Response Chain Must Be Complete Before Street Transition](./process-video-hh-preflop-squeeze-response-chain-must-be-complete.md)

100. [Video-HH Focus-First Detection Must Use Active Ring And Timebar As Primary Signal](./process-video-hh-focus-first-must-use-ring-and-timebar.md)

101. [Video-HH Action Inference Must Prioritize Pot/Stack Delta Over Static Action Text](./process-video-hh-action-inference-must-prioritize-pot-and-stack-delta.md)

102. [Video-HH Postfactum Turn Context Must Explain Action Timestamp Lag](./process-video-hh-postfactum-turn-context-must-explain-action-lag.md)

103. [Video-HH Pre-Roll Fold Inference Must Break Same-Timestamp Ties Before First Aggression](./process-video-hh-preroll-fold-order-must-break-same-ms-ties.md)

104. [Video-HH Sampling Must Use 1s Baseline With Adaptive Refinement On Pot Jumps](./process-video-hh-sampling-must-use-1s-baseline-with-adaptive-refine-on-pot-jumps.md)

105. [Video-HH Preview Must Use Global Event Index And Show Focus Actor](./process-video-hh-preview-must-use-global-event-index-and-focus-column.md)

106. [Video-HH Action Commit Must Require Two Independent Signals](./process-video-hh-commit-must-require-two-independent-signals.md)

107. [Video-HH Pending Events Must Resolve At Nearest Committed Anchor](./process-video-hh-pending-events-must-resolve-at-nearest-committed-anchor.md)

108. [Video-HH Backward Inference Must Stop At Committed Anchor](./process-video-hh-backward-inference-must-stop-at-committed-anchor.md)

109. [Video-HH Terminal Hand State Must Set Focus To None](./process-video-hh-terminal-state-must-set-focus-none.md)

110. [Video-HH Inferred Events Must Carry Explicit Resolution State](./process-video-hh-inferred-events-must-carry-explicit-resolution-state.md)
111. [Video-HH Preview Explainability Must Show Signals, Locked History, And Next Expectation](./process-video-hh-preview-explainability-must-show-signals-history-and-next-expectation.md)
112. [Video-HH Stale Preflop Response Must Lock Actor Focus And Mark Pending](./process-video-hh-stale-preflop-response-must-lock-actor-focus-and-mark-pending.md)
113. [Video-HH Preview Must Exclude Pending Rows From Event Numbering](./process-video-hh-preview-must-exclude-pending-rows-from-event-numbering.md)
114. [Video-HH Reconstruction Must Be Ledger-First With Validator](./process-video-hh-reconstruction-must-be-ledger-first-with-validator.md)
115. [Video-HH Gap Resolution Must Stay Between Committed Anchors](./process-video-hh-gap-resolution-must-stay-between-committed-anchors.md)
116. [Video-HH Review Preview Must Show Proof Blocks For Inferred Actions](./process-video-hh-review-preview-must-show-proof-blocks-for-inferred-actions.md)

## How to Add a Rule

1. Copy `rules/rule-template.md` into a new file named `rules/<category>-<slug>.md`.
2. Fill all required sections.
3. Add the new file to this index with a one-line summary.
