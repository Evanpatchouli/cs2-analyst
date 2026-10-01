# CS2 Coach Architecture

## Overview

CS2 Coach is structured as a desktop application with a deterministic analysis core.

## Packages

- `dem-parser`: CS2 DEM parsing adapter layer
- `match-model`: domain models for matches, rounds and players
- `analytics`: deterministic metrics calculation
- `findings`: pattern detection and coaching evidence

## Principles

DEM parsing, analysis logic and UI presentation must remain independent.

AI coaching is an optional interpretation layer built on top of structured findings.
