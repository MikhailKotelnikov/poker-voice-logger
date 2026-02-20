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

## How to Add a Rule

1. Copy `rules/rule-template.md` into a new file named `rules/<category>-<slug>.md`.
2. Fill all required sections.
3. Add the new file to this index with a one-line summary.
