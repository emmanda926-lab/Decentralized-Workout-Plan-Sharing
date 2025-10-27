(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-PLAN-NOT-FOUND u101)
(define-constant ERR-INSUFFICIENT-PAYMENT u102)
(define-constant ERR-INVALID-PLAN-ID u103)
(define-constant ERR-PAYMENT-ALREADY-MADE u104)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-INVALID-CURRENCY u108)
(define-constant ERR-TRANSFER-FAILED u109)
(define-constant ERR-INVALID-RECIPIENT u110)
(define-constant ERR-PAYMENT-NOT-FOUND u111)
(define-constant ERR-INVALID-STATUS u112)
(define-constant ERR-INVALID-FEE-RATE u113)
(define-constant ERR-MAX-PAYMENTS-EXCEEDED u114)

(define-data-var authority-contract (optional principal) none)
(define-data-var platform-fee-rate uint u5)
(define-data-var max-payments uint u100000)
(define-data-var next-payment-id uint u0)

(define-map payments
  uint
  {
    plan-id: uint,
    buyer: principal,
    creator: principal,
    amount: uint,
    timestamp: uint,
    currency: (string-utf8 20),
    status: bool
  }
)

(define-map payment-by-plan-buyer
  { plan-id: uint, buyer: principal }
  uint)

(define-read-only (get-payment (payment-id uint))
  (map-get? payments payment-id)
)

(define-read-only (get-payment-by-plan-buyer (plan-id uint) (buyer principal))
  (map-get? payment-by-plan-buyer { plan-id: plan-id, buyer: buyer })
)

(define-read-only (get-platform-fee-rate)
  (ok (var-get platform-fee-rate))
)

(define-read-only (get-payment-count)
  (ok (var-get next-payment-id))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-RECIPIENT))
)

(define-private (validate-fee-rate (rate uint))
  (if (<= rate u100)
      (ok true)
      (err ERR-INVALID-FEE-RATE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-platform-fee-rate (new-rate uint))
  (begin
    (try! (validate-fee-rate new-rate))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set platform-fee-rate new-rate)
    (ok true)
  )
)

(define-public (process-payment (plan-id uint) (amount uint) (currency (string-utf8 20)))
  (let (
        (plan (contract-call? .WorkoutPlanRegistry get-plan plan-id))
        (next-id (var-get next-payment-id))
        (authority (var-get authority-contract))
        (fee-amount (/ (* amount (var-get platform-fee-rate)) u100))
        (creator-amount (- amount fee-amount))
      )
    (asserts! (< next-id (var-get max-payments)) (err ERR-MAX-PAYMENTS-EXCEEDED))
    (asserts! (is-some plan) (err ERR-PLAN-NOT-FOUND))
    (asserts! (>= amount (get price (unwrap! plan (err ERR-PLAN-NOT-FOUND)))) (err ERR-INSUFFICIENT-PAYMENT))
    (try! (validate-amount amount))
    (try! (validate-currency currency))
    (try! (validate-timestamp block-height))
    (asserts! (is-none (map-get? payment-by-plan-buyer { plan-id: plan-id, buyer: tx-sender })) (err ERR-PAYMENT-ALREADY-MADE))
    (let (
          (creator (get creator (unwrap! plan (err ERR-PLAN-NOT-FOUND))))
          (authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED)))
        )
      (try! (validate-principal creator))
      (try! (stx-transfer? creator-amount tx-sender creator))
      (try! (stx-transfer? fee-amount tx-sender authority-recipient))
    )
    (map-set payments next-id
      {
        plan-id: plan-id,
        buyer: tx-sender,
        creator: (get creator (unwrap! plan (err ERR-PLAN-NOT-FOUND))),
        amount: amount,
        timestamp: block-height,
        currency: currency,
        status: true
      }
    )
    (map-set payment-by-plan-buyer { plan-id: plan-id, buyer: tx-sender } next-id)
    (var-set next-payment-id (+ next-id u1))
    (print { event: "payment-processed", payment-id: next-id, plan-id: plan-id })
    (ok next-id)
  )
)