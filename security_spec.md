# Firestore Security Spec

## 1. Data Invariants
- `UserProfile` must be owned by the user.
- `Meal` must be logged under the user's ID, must contain valid macronutrients and calories, and the optional `ingredients` array must only contain valid objects with names and calories. `servings` must be a positive number if provided.
- `Workout` must be owned by the specific user.
- `StepLog` must be owned by the specific user.

## 2. Dirty Dozen Payloads
- **Spoofed Ownership**: User A tries to read/write User B's meals.
- **Negative Servings**: Creating a meal with `servings: -1`.
- **String Servings**: Creating a meal with `servings: "2"`.
- **Invalid Ingredients Struct**: Providing `ingredients: [{name: "bread"}]` (missing calories) or calories as strings.
- **Giant Array Attack**: Providing `ingredients` with > 100 items.
- ...

## 3. The Test Runner
(We'll rely on eslint integration or standard testing here, though we'll strictly ensure the rules enforce these points manually for now).
