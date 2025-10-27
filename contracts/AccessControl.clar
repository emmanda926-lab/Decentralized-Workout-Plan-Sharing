(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PLAN-NOT-FOUND u101)
(define-constant ERR-PAYMENT-NOT-FOUND u102)
(define-constant ERR-ACCESS-DENIED u103)
(define-constant ERR-INVALID-PLAN-ID u104)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-INVALID-ACCESS-ID u107)
(define-constant ERR-ACCESS-ALREADY-GRANTED u108)
(define-constant ERR-ACCESS-NOT-FOUND u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-INVALID-DURATION u111)
(define-constant ERR-MAX-ACCESSES-EXCEEDED u112)
(define-constant ERR-INVALID-RECIPIENT u113)

(define-data-var authority-contract (optional principal) none)
(define-data-var max-accesses uint u100000)
(define-data-var next-access-id uint u0)

(define-map access-records
  uint
  {
    plan-id: uint,
    user: principal,
    payment-id: uint,
    timestamp: uint,
    duration: uint,
    status: bool
  }
)

(define-map access-by-plan-user
  { plan-id: uint, user: principal }
  uint)

(define-read-only (get-access (access-id uint))
  (map-get? access-records access-id)
)

(define-read-only (get-access-by-plan-user (plan-id uint) (user principal))
  (map-get? access-by-plan-user { plan-id: plan-id, user: user })
)

(define-read-only (get-access-count)
  (ok (var-get next-access-id))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-duration (dur uint))
  (if (and (> dur u0) (<= dur u365))
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-RECIPIENT))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (grant-access (plan-id uint) (user principal) (duration uint))
  (let (
        (plan (contract-call? .WorkoutPlanRegistry get-plan plan-id))
        (payment (contract-call? .PaymentProcessor get-payment-by-plan-buyer plan-id user))
        (next-id (var-get next-access-id))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id (var-get max-accesses)) (err ERR-MAX-ACCESSES-EXCEEDED))
    (asserts! (is-some plan) (err ERR-PLAN-NOT-FOUND))
    (asserts! (is-some payment) (err ERR-PAYMENT-NOT-FOUND))
    (try! (validate-timestamp block-height))
    (try! (validate-duration duration))
    (try! (validate-principal user))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (is-none (map-get? access-by-plan-user { plan-id: plan-id, user: user })) (err ERR-ACCESS-ALREADY-GRANTED))
    (map-set access-records next-id
      {
        plan-id: plan-id,
        user: user,
        payment-id: (unwrap! payment (err ERR-PAYMENT-NOT-FOUND)),
        timestamp: block-height,
        duration: duration,
        status: true
      }
    )
    (map-set access-by-plan-user { plan-id: plan-id, user: user } next-id)
    (var-set next-access-id (+ next-id u1))
    (print { event: "access-granted", access-id: next-id, plan-id: plan-id, user: user })
    (ok next-id)
  )
)

(define-public (revoke-access (plan-id uint) (user principal))
  (let (
        (access-id (map-get? access-by-plan-user { plan-id: plan-id, user: user }))
        (plan (contract-call? .WorkoutPlanRegistry get-plan plan-id))
        (authority (var-get authority-contract))
      )
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (is-some plan) (err ERR-PLAN-NOT-FOUND))
    (asserts! (is-eq tx-sender (get creator (unwrap! plan (err ERR-PLAN-NOT-FOUND)))) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some access-id) (err ERR-ACCESS-NOT-FOUND))
    (map-set access-records (unwrap! access-id (err ERR-ACCESS-NOT-FOUND))
      {
        plan-id: plan-id,
        user: user,
        payment-id: (get payment-id (unwrap! (map-get? access-records (unwrap! access-id (err ERR-ACCESS-NOT-FOUND))) (err ERR-ACCESS-NOT-FOUND))),
        timestamp: (get timestamp (unwrap! (map-get? access-records (unwrap! access-id (err ERR-ACCESS-NOT-FOUND))) (err ERR-ACCESS-NOT-FOUND))),
        duration: (get duration (unwrap! (map-get? access-records (unwrap! access-id (err ERR-ACCESS-NOT-FOUND))) (err ERR-ACCESS-NOT-FOUND))),
        status: false
      }
    )
    (map-delete access-by-plan-user { plan-id: plan-id, user: user })
    (print { event: "access-revoked", access-id: (unwrap! access-id (err ERR-ACCESS-NOT-FOUND)), plan-id: plan-id, user: user })
    (ok true)
  )
)

(define-public (verify-access (plan-id uint) (user principal))
  (let (
        (access-id (map-get? access-by-plan-user { plan-id: plan-id, user: user }))
        (plan (contract-call? .WorkoutPlanRegistry get-plan plan-id))
      )
    (asserts! (is-some plan) (err ERR-PLAN-NOT-FOUND))
    (match access-id
      id
        (let ((access (unwrap! (map-get? access-records id) (err ERR-ACCESS-NOT-FOUND))))
          (if (and (get status access) (<= (+ (get timestamp access) (get duration access)) block-height))
              (ok true)
              (err ERR-ACCESS-DENIED))
        )
      (err ERR-ACCESS-NOT-FOUND)
    )
  )
)