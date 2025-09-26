(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-TITLE u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-CATEGORY u104)
(define-constant ERR-INVALID-PRICE u105)
(define-constant ERR-PLAN-ALREADY-EXISTS u106)
(define-constant ERR-PLAN-NOT-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u109)
(define-constant ERR-INVALID-DURATION u110)
(define-constant ERR-INVALID-DIFFICULTY u111)
(define-constant ERR-PLAN-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-INVALID-UPDATE-PARAM u113)
(define-constant ERR-MAX-PLANS-EXCEEDED u114)
(define-constant ERR-INVALID-PLAN-TYPE u115)
(define-constant ERR-INVALID-TARGET-AUDIENCE u116)
(define-constant ERR-INVALID-EQUIPMENT u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var next-plan-id uint u0)
(define-data-var max-plans uint u10000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map plans
  uint
  {
    hash: (buff 32),
    title: (string-utf8 100),
    description: (string-utf8 500),
    category: (string-utf8 50),
    price: uint,
    timestamp: uint,
    creator: principal,
    plan-type: (string-utf8 50),
    duration: uint,
    difficulty: (string-utf8 20),
    target-audience: (string-utf8 100),
    equipment: (string-utf8 200),
    location: (string-utf8 100),
    currency: (string-utf8 20),
    status: bool
  }
)

(define-map plans-by-hash
  (buff 32)
  uint)

(define-map plan-updates
  uint
  {
    update-title: (string-utf8 100),
    update-description: (string-utf8 500),
    update-price: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-plan (id uint))
  (map-get? plans id)
)

(define-read-only (get-plan-updates (id uint))
  (map-get? plan-updates id)
)

(define-read-only (is-plan-registered (hash (buff 32)))
  (is-some (map-get? plans-by-hash hash))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-title (title (string-utf8 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-price (price uint))
  (if (>= price u0)
      (ok true)
      (err ERR-INVALID-PRICE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-plan-type (ptype (string-utf8 50)))
  (if (or (is-eq ptype "strength") (is-eq ptype "cardio") (is-eq ptype "yoga"))
      (ok true)
      (err ERR-INVALID-PLAN-TYPE))
)

(define-private (validate-duration (dur uint))
  (if (and (> dur u0) (<= dur u365))
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-difficulty (diff (string-utf8 20)))
  (if (or (is-eq diff "beginner") (is-eq diff "intermediate") (is-eq diff "advanced"))
      (ok true)
      (err ERR-INVALID-DIFFICULTY))
)

(define-private (validate-target-audience (audience (string-utf8 100)))
  (if (<= (len audience) u100)
      (ok true)
      (err ERR-INVALID-TARGET-AUDIENCE))
)

(define-private (validate-equipment (equip (string-utf8 200)))
  (if (<= (len equip) u200)
      (ok true)
      (err ERR-INVALID-EQUIPMENT))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (<= (len loc) u100)
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-plans (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX_PLANS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-plans new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-plan
  (plan-hash (buff 32))
  (title (string-utf8 100))
  (description (string-utf8 500))
  (category (string-utf8 50))
  (price uint)
  (plan-type (string-utf8 50))
  (duration uint)
  (difficulty (string-utf8 20))
  (target-audience (string-utf8 100))
  (equipment (string-utf8 200))
  (location (string-utf8 100))
  (currency (string-utf8 20))
)
  (let (
        (next-id (var-get next-plan-id))
        (current-max (var-get max-plans))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX_PLANS-EXCEEDED))
    (try! (validate-hash plan-hash))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-category category))
    (try! (validate-price price))
    (try! (validate-plan-type plan-type))
    (try! (validate-duration duration))
    (try! (validate-difficulty difficulty))
    (try! (validate-target-audience target-audience))
    (try! (validate-equipment equipment))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (asserts! (is-none (map-get? plans-by-hash plan-hash)) (err ERR-PLAN-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set plans next-id
      {
        hash: plan-hash,
        title: title,
        description: description,
        category: category,
        price: price,
        timestamp: block-height,
        creator: tx-sender,
        plan-type: plan-type,
        duration: duration,
        difficulty: difficulty,
        target-audience: target-audience,
        equipment: equipment,
        location: location,
        currency: currency,
        status: true
      }
    )
    (map-set plans-by-hash plan-hash next-id)
    (var-set next-plan-id (+ next-id u1))
    (print { event: "plan-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-plan
  (plan-id uint)
  (update-title (string-utf8 100))
  (update-description (string-utf8 500))
  (update-price uint)
)
  (let ((plan (map-get? plans plan-id)))
    (match plan
      p
        (begin
          (asserts! (is-eq (get creator p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-title update-title))
          (try! (validate-description update-description))
          (try! (validate-price update-price))
          (map-set plans plan-id
            {
              hash: (get hash p),
              title: update-title,
              description: update-description,
              category: (get category p),
              price: update-price,
              timestamp: block-height,
              creator: (get creator p),
              plan-type: (get plan-type p),
              duration: (get duration p),
              difficulty: (get difficulty p),
              target-audience: (get target-audience p),
              equipment: (get equipment p),
              location: (get location p),
              currency: (get currency p),
              status: (get status p)
            }
          )
          (map-set plan-updates plan-id
            {
              update-title: update-title,
              update-description: update-description,
              update-price: update-price,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "plan-updated", id: plan-id })
          (ok true)
        )
      (err ERR-PLAN-NOT-FOUND)
    )
  )
)

(define-public (get-plan-count)
  (ok (var-get next-plan-id))
)

(define-public (check-plan-existence (hash (buff 32)))
  (ok (is-plan-registered hash))
)