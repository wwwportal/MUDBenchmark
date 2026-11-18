import Lean

/- A standalone experiment; not part of the live world or its generated rules. -/
namespace ManaGate

set_option autoImplicit false

inductive Route where
  | direct
  | bypass
  deriving DecidableEq, Repr

structure Network where
  directOpen : Bool
  bypassOpen : Bool
  deriving Repr

def available (net : Network) : Route → Bool
  | .direct => net.directOpen
  | .bypass => net.bypassOpen

/-- Every successful transfer delivers one unit; longer routes also cost mana. -/
def cost : Route → Nat
  | .direct => 1
  | .bypass => 2

inductive Verdict where
  | delivered
  | routeClosed
  | insufficientMana
  deriving DecidableEq, Repr

def decideTransfer (net : Network) (mana : Nat) (route : Route) : Verdict :=
  if available net route = false then .routeClosed
  else if cost route ≤ mana then .delivered
  else .insufficientMana

theorem delivered_iff (net : Network) (mana : Nat) (route : Route) :
    decideTransfer net mana route = .delivered ↔
      available net route = true ∧ cost route ≤ mana := by
  cases h : available net route <;> simp [decideTransfer, h]

theorem routeClosed_iff (net : Network) (mana : Nat) (route : Route) :
    decideTransfer net mana route = .routeClosed ↔ available net route = false := by
  cases h : available net route <;> simp [decideTransfer, h]
  split <;> simp

theorem insufficientMana_iff (net : Network) (mana : Nat) (route : Route) :
    decideTransfer net mana route = .insufficientMana ↔
      available net route = true ∧ mana < cost route := by
  cases h : available net route <;> simp [decideTransfer, h, ← Nat.not_le]

theorem verdict_saturates (net : Network) (mana : Nat) (route : Route)
    (enough : 2 ≤ mana) :
    decideTransfer net mana route = decideTransfer net 2 route := by
  cases route <;> cases net with
  | mk directOpen bypassOpen =>
    cases directOpen <;> cases bypassOpen <;>
      simp [decideTransfer, available, cost] <;> omega

structure TickResult where
  remaining : Nat
  spent : Nat
  deliveries : Nat
  verdicts : List Verdict
  deriving Repr

/-- Resolve competing proposals in input order against a single shared balance. -/
def settle (net : Network) (mana : Nat) : List Route → TickResult
  | [] => ⟨mana, 0, 0, []⟩
  | route :: rest =>
    let verdict := decideTransfer net mana route
    let paid := if verdict = .delivered then cost route else 0
    let tail := settle net (mana - paid) rest
    ⟨tail.remaining, paid + tail.spent,
      (if verdict = .delivered then 1 else 0) + tail.deliveries, verdict :: tail.verdicts⟩

theorem settle_accounts (net : Network) (mana : Nat) (routes : List Route) :
    (settle net mana routes).remaining + (settle net mana routes).spent = mana := by
  induction routes generalizing mana with
  | nil => simp [settle]
  | cons route rest ih =>
    by_cases h : decideTransfer net mana route = .delivered
    · have affordable := ((delivered_iff net mana route).mp h).2
      have tail := ih (mana - cost route)
      simp only [settle, h, if_true]
      omega
    · simpa [settle, h] using ih mana

theorem deliveries_le_spent (net : Network) (mana : Nat) (routes : List Route) :
    (settle net mana routes).deliveries ≤ (settle net mana routes).spent := by
  induction routes generalizing mana with
  | nil => simp [settle]
  | cons route rest ih =>
    by_cases h : decideTransfer net mana route = .delivered
    · have tail := ih (mana - cost route)
      have positive : 1 ≤ cost route := by cases route <;> decide
      simp only [settle, h, if_true]
      omega
    · simpa [settle, h] using ih mana

theorem no_double_spend (net : Network) (mana : Nat) (routes : List Route) :
    (settle net mana routes).deliveries ≤ (settle net mana routes).spent ∧
      (settle net mana routes).spent ≤ mana := by
  exact ⟨deliveries_le_spent net mana routes, by
    have h := settle_accounts net mana routes
    omega⟩

theorem closed_proposal_preserves_supply (net : Network) (mana : Nat) (route : Route)
    (closed : available net route = false) :
    (settle net mana [route]).remaining = mana ∧
      (settle net mana [route]).spent = 0 ∧
      (settle net mana [route]).deliveries = 0 := by
  have refused := (routeClosed_iff net mana route).mpr closed
  simp [settle, refused]

/-- All scenarios begin bonded. Without upkeep the bond simply persists. -/
def gateShut (upkeep : Bool) (outcome : TickResult) : Bool :=
  !upkeep || decide (0 < outcome.deliveries)

def intact : Network := ⟨true, true⟩
def cut : Network := ⟨false, true⟩

inductive Plan where
  | idle
  | direct
  | bypass
  deriving Repr

def proposals : Plan → List Route
  | .idle => []
  | .direct => [.direct]
  | .bypass => [.bypass]

/-- Minimize spending subject to the gate staying shut, among single-route plans or idling. -/
def Optimal (upkeep : Bool) (net : Network) (mana : Nat) (plan : Plan) : Prop :=
  let outcome := settle net mana (proposals plan)
  gateShut upkeep outcome = true ∧
    ∀ alternative : Plan,
      let other := settle net mana (proposals alternative)
      gateShut upkeep other = true → outcome.spent ≤ other.spent

theorem direct_optimal_when_intact : Optimal true intact 2 .direct := by
  constructor
  · decide
  · intro alternative
    cases alternative <;> decide

theorem bypass_only_feasible_after_cut :
    Optimal true cut 2 .bypass ∧
      gateShut true (settle cut 2 (proposals .direct)) = false ∧
      gateShut true (settle cut 2 (proposals .idle)) = false := by
  refine ⟨?_, by decide, by decide⟩
  constructor
  · decide
  · intro alternative
    cases alternative <;> decide

theorem direct_beats_bypass_when_intact :
    (settle intact 2 (proposals .direct)).spent <
      (settle intact 2 (proposals .bypass)).spent ∧
    gateShut true (settle intact 2 (proposals .bypass)) = true := by decide

theorem no_upkeep_idle_optimal (net : Network) (mana : Nat) :
    Optimal false net mana .idle := by
  constructor
  · rfl
  · intro alternative
    dsimp only
    intro _
    exact Nat.zero_le _

example : (settle intact 1 [.direct, .direct]).verdicts =
    [.delivered, .insufficientMana] := by decide

end ManaGate

private def verdictName : ManaGate.Verdict → String
  | .delivered => "delivered"
  | .routeClosed => "routeClosed"
  | .insufficientMana => "insufficientMana"

def main : IO Unit := do
  let mut entries : Array Lean.Json := #[]
  for directOpen in [false, true] do
    for bypassOpen in [false, true] do
      for (routeName, route) in [("direct", ManaGate.Route.direct), ("bypass", .bypass)] do
        for mana in [0, 1, 2] do
          let net : ManaGate.Network := ⟨directOpen, bypassOpen⟩
          entries := entries.push <| Lean.Json.mkObj [
            ("directOpen", Lean.toJson directOpen),
            ("bypassOpen", Lean.toJson bypassOpen),
            ("route", Lean.toJson routeName),
            ("mana", Lean.toJson mana),
            ("verdict", Lean.toJson (verdictName (ManaGate.decideTransfer net mana route)))]
  IO.println <| (Lean.Json.mkObj [
    ("schema", Lean.toJson ("mudbenchmark/mana-gate-verdicts/1" : String)),
    ("entries", Lean.Json.arr entries)]).compress
