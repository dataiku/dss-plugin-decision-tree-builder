# Changelog

## Version 1.1.3 (2025-12-10)
* Bump angularjs to 1.8.2
* Fix console errors when saving/exiting


## Version 1.1.2 (2025-05-14)
* Fix issue with webapp not displaying correctly
* Fix bug in pandas > 2
* Fix plugin make command

## Version 1.1.1 (2024-05-07)
* Scoring recipe: Specify array content type for decision_rules in output schema

## Version 1.1.0 (2023-05-11)
* Webapp: Fix autosplit (outdated kwarg in sklearn's DecisionTreeClassifier)
* Evaluation recipe: Fix recipe with multiclass tasks + import error
* Scoring recipe: Fix recipe for trees with only one node

## Version 1.0.7 (2022-11-10)
* Webapp: Display node id in node info panel
* Scoring/Evaluation recipes: Add two columns (one with the decision rule, one with the leaf id)

## Version 1.0.6 (2022-10-06)
* Webapp: Many UI improvements
* Webapp: Allow to treat features as numerical when less than 10 distinct values

## Version 1.0.5 (2022-01-28)
* Evaluation recipe: Fix broken import
* Minor UI improvement in webapp: fix font in buttons & input fields

## Version 1.0.4 (2021-10)
* Evaluation recipe: Fix broken import
* Evaluation recipe: Fix containerized execution (missing import)
* Evaluation recipe: Add missing key costMatrixWeights in metrics dict
* Fix wrong documentation link
