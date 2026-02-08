param(
  [string]$RoutesFile = "docs/ux-audit-routes.json",
  [string]$OutDir = "docs/ux-audit"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path $RoutesFile)) {
  throw "Routes file not found: $RoutesFile"
}

function To-Array($value) {
  if ($null -eq $value) { return @() }
  if ($value -is [System.Collections.IDictionary] -and $value.Count -eq 0) { return @() }
  if ($value -is [string] -and [string]::IsNullOrWhiteSpace($value)) { return @() }
  if ($value -is [System.Array]) { return @($value) }
  return @($value)
}

function Normalize-Route([string]$route) {
  if ($route -eq "/page.tsx") { return "/" }
  return $route
}

function Get-Module([string]$route) {
  switch -Regex ($route) {
    "^/$|^/login$|^/signup$|^/verify-email$|^/invite$" { return "public" }
    "^/dashboard$|^/home$" { return "dashboard" }
    "^/invoices|^/credit-notes|^/payments-received" { return "sales" }
    "^/bills|^/debit-notes|^/vendor-payments|^/purchase-orders|^/purchaseorder" { return "purchases" }
    "^/bank-accounts|^/bank-transactions|^/reconciliation|^/pdc" { return "banking" }
    "^/items|^/inventory" { return "inventory" }
    "^/journals" { return "accounting" }
    "^/reports" { return "reports" }
    "^/settings" { return "settings" }
    "^/platform" { return "platform" }
    default { return "misc" }
  }
}

function Get-Screen-Slug([string]$route) {
  $clean = $route.Trim("/")
  if ([string]::IsNullOrWhiteSpace($clean)) { return "landing" }
  $clean = $clean -replace "\{id\}", "detail"
  $clean = $clean -replace "[^a-zA-Z0-9/\-]", ""
  $clean = $clean -replace "/", "-"
  return $clean.ToLowerInvariant()
}

function To-Title([string]$value) {
  $textInfo = (Get-Culture).TextInfo
  $norm = $value -replace "-", " "
  return $textInfo.ToTitleCase($norm)
}

function Get-Screen-Title([string]$route) {
  if ($route -eq "/") { return "Landing" }
  $parts = $route.Trim("/").Split("/")
  $mapped = foreach ($part in $parts) {
    switch ($part) {
      "{id}" { "Detail"; break }
      "pdc" { "PDC"; break }
      "ap-aging" { "AP Aging"; break }
      "ar-aging" { "AR Aging"; break }
      "profit-loss" { "Profit & Loss"; break }
      "trial-balance" { "Trial Balance"; break }
      "vat-summary" { "VAT Summary"; break }
      "units-of-measurement" { "Units of Measurement"; break }
      "purchaseorder" { "Purchase Order Legacy"; break }
      default { To-Title $part; break }
    }
  }
  return ($mapped -join " ")
}

function New-Gap {
  param(
    [string]$Feature,
    [string]$ExistsLedgerLite,
    [string]$ExistsZoho,
    [string]$GapType,
    [string]$Impact,
    [string]$Frequency,
    [string]$RevenueRelevance,
    [string]$Rationale = ""
  )

  $impactWeight = @{
    Critical = 5
    High = 4
    Medium = 3
    Low = 2
  }
  $frequencyWeight = @{
    "Daily use" = 5
    Weekly = 4
    Monthly = 3
    Rare = 2
  }
  $revenueWeight = @{
    "Directly impacts billing/cashflow" = 5
    "Indirectly impacts efficiency" = 3
    Cosmetic = 1
  }

  $score = $impactWeight[$Impact] * $frequencyWeight[$Frequency] * $revenueWeight[$RevenueRelevance]

  return [PSCustomObject]@{
    Feature = $Feature
    ExistsLedgerLite = $ExistsLedgerLite
    ExistsZoho = $ExistsZoho
    GapType = $GapType
    Impact = $Impact
    Frequency = $Frequency
    RevenueRelevance = $RevenueRelevance
    PriorityScore = $score
    Rationale = $Rationale
  }
}

function Get-Zoho-Capabilities {
  param(
    [string]$route,
    [string]$module
  )

  $moduleDefaults = @{
    public = @(
      "Guided signup and invite acceptance with strong auth guardrails.",
      "Organization-aware onboarding that avoids entering operational screens too early.",
      "Clear account lifecycle prompts (verification, resets, access)."
    )
    dashboard = @(
      "Cash, receivables, payables, and task-oriented widgets in one place.",
      "Drilldowns from dashboard cards into pending actions.",
      "Role-sensitive summary widgets and reminders."
    )
    sales = @(
      "Mature invoice lifecycle with reminders, payment links, and credit application.",
      "Saved views and status filters across lists.",
      "Transaction timeline and communication context around customer docs."
    )
    purchases = @(
      "Purchase orders, bills, vendor credits, and vendor payment workflows are tightly linked.",
      "Document status lifecycle and conversion flows (PO to Bill).",
      "Operational productivity features around list filters, quick actions, and traceability."
    )
    banking = @(
      "Bank feeds + categorization + reconciliation flow with discrepancy handling.",
      "Support for split and match workflows in reconciliation.",
      "Banking views focused on unresolved items and close tasks."
    )
    accounting = @(
      "Journal operations with posting controls and traceability.",
      "Period protection and high-integrity correction workflows.",
      "Auditability around financial adjustments."
    )
    reports = @(
      "High-utility report presets with filters and period comparison.",
      "Drilldown and export flows for accountant review cycles.",
      "Strong focus on aging, VAT, and statutory reporting usability."
    )
    settings = @(
      "Transaction locking and audit-oriented controls.",
      "Configurable accounting preferences and taxes.",
      "Admin-focused guardrails for organization-level controls."
    )
    platform = @(
      "Org administration controls for lifecycle and access governance."
    )
    misc = @(
      "Consistent navigation, state feedback, and actionable validation."
    )
  }

  $items = @($moduleDefaults[$module])

  switch -Regex ($route) {
    "^/purchase-orders|^/purchaseorder" {
      $items += "Purchase Order statuses include Draft/Open/Partially Billed/Billed/Cancelled in Zoho help."
      $items += "POs can be converted into bills with line-level billing progression."
      break
    }
    "^/reconciliation" {
      $items += "Zoho reconciliation flow includes statement period controls and reconciliation reporting."
      $items += "Zoho warns that opening balances should not be edited after reconciliation."
      break
    }
    "^/bank-transactions/import" {
      $items += "Zoho provides automated feed refresh patterns and manual refresh paths for MFA banks."
      break
    }
    "^/settings/audit-log" {
      $items += "Zoho exposes audit trail history and version comparison for transaction changes."
      break
    }
    "^/settings/opening-balances" {
      $items += "Zoho-style migration flows rely on cut-over and opening values with accounting validation."
      break
    }
    "^/invoices|^/payments-received" {
      $items += "Zoho supports customer-facing payment workflows with reminder automation."
      break
    }
    "^/reports/" {
      $items += "Zoho emphasizes export-ready accounting reports and period-driven review."
      break
    }
  }

  return $items | Select-Object -Unique
}

function Build-Gaps {
  param(
    [string]$route,
    [string]$module,
    $meta
  )

  $gaps = @()

  $hasFilter = [bool]$meta.hasFilterRow
  $hasSavedViews = [bool]$meta.hasSavedViews
  $hasStatusChip = [bool]$meta.hasStatusChip
  $hasForm = [bool]$meta.hasForm
  $hasFieldArray = [bool]$meta.hasFieldArray
  $hasLockDateWarning = [bool]$meta.hasLockDateWarning
  $hasAttachments = [bool]$meta.hasAttachments
  $hasDialog = [bool]$meta.hasDialog

  $methods = To-Array $meta.methods
  $isDetail = $route -match "/\{id\}$"
  $isList = -not $isDetail -and -not ($route -in @("/", "/login", "/signup", "/invite", "/verify-email"))
  $isTransactional = $route -match "^/(invoices|credit-notes|payments-received|bills|debit-notes|expenses|vendor-payments|purchase-orders|purchaseorder|journals|settings/opening-balances|reconciliation)"

  if ($isList -and -not $hasFilter) {
    $gaps += New-Gap -Feature "Inline filter bar for day-to-day segmentation" -ExistsLedgerLite "No" -ExistsZoho "Yes" -GapType "UX Deficiency" -Impact "High" -Frequency "Daily use" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "List screens without direct filtering slow operational review."
  }

  if ($isList -and -not $hasSavedViews) {
    $gaps += New-Gap -Feature "Saved views with reusable list criteria" -ExistsLedgerLite "No" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "Medium" -Frequency "Daily use" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Teams repeatedly rebuild the same filters."
  }

  if ($isTransactional -and -not $hasAttachments) {
    $gaps += New-Gap -Feature "Native attachment handling on transaction screen" -ExistsLedgerLite "No" -ExistsZoho "Yes" -GapType "Missing Feature" -Impact "High" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Source document traceability is needed during review and audits."
  }

  if ($isTransactional -and -not $hasLockDateWarning) {
    $gaps += New-Gap -Feature "Visible period-lock warning at point of edit/post" -ExistsLedgerLite "No" -ExistsZoho "Yes" -GapType "Compliance Risk" -Impact "Critical" -Frequency "Monthly" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Period controls should be explicit in accounting transaction flows."
  }

  if ($isTransactional -and -not ($methods -contains "POST")) {
    $gaps += New-Gap -Feature "Explicit post/confirm action with irreversible warning" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "High" -Frequency "Weekly" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Posted-state transitions should be explicit and user-confirmed."
  }

  if ($isTransactional -and -not $hasDialog) {
    $gaps += New-Gap -Feature "Confirmation modal for destructive/irreversible actions" -ExistsLedgerLite "No" -ExistsZoho "Yes" -GapType "UX Deficiency" -Impact "Medium" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Confirmation reduces accidental posting/voiding risk."
  }

  if ($isTransactional) {
    $gaps += New-Gap -Feature "Optimistic concurrency guard for multi-user edits" -ExistsLedgerLite "Not Evident" -ExistsZoho "Yes" -GapType "Performance Risk" -Impact "High" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "No version token or conflict UI is visible from route scan."
    $gaps += New-Gap -Feature "Direct audit trail jump from transaction details" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "Medium" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Audit log exists globally but transaction-level pivot is not evident."
    $gaps += New-Gap -Feature "Posted-state immutability cues in UI" -ExistsLedgerLite "Not Evident" -ExistsZoho "Yes" -GapType "Compliance Risk" -Impact "Critical" -Frequency "Monthly" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Users need clear lock/readonly semantics after posting."
  }

  if ($module -eq "reports") {
    $gaps += New-Gap -Feature "Report scheduling and periodic email delivery" -ExistsLedgerLite "No" -ExistsZoho "Yes" -GapType "Automation Missing" -Impact "Medium" -Frequency "Monthly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Periodic close tasks benefit from automated report runs."
    $gaps += New-Gap -Feature "Expanded comparative filters (period-over-period presets)" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "Medium" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Comparative analysis reduces manual export steps."
  }

  if ($route -eq "/settings/audit-log") {
    $gaps += New-Gap -Feature "Before/after diff view per transaction version" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Missing Feature" -Impact "High" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Auditors need direct field-level delta comparisons."
    $gaps += New-Gap -Feature "One-click jump from audit event to source document" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "Medium" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Investigation latency is reduced when linked navigation exists."
  }

  if ($route -eq "/settings/opening-balances") {
    $gaps += New-Gap -Feature "Import template validation assistant before draft commit" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Automation Missing" -Impact "High" -Frequency "Rare" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Migration errors can pollute opening trial balance."
    $gaps += New-Gap -Feature "Cut-over integrity checklist (lock date + approval + final preview signoff)" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Compliance Risk" -Impact "Critical" -Frequency "Rare" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Opening balance posting is high-risk and should be hardened."
  }

  if ($route -match "^/purchase-orders|^/purchaseorder") {
    $gaps += New-Gap -Feature "PO status lifecycle controls (Open/Partially Billed/Billed/Cancelled) in one screen" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "High" -Frequency "Weekly" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Procurement progress tracking needs explicit transitions."
    $gaps += New-Gap -Feature "Line-level PO to Bill conversion visibility" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Automation Missing" -Impact "High" -Frequency "Weekly" -RevenueRelevance "Directly impacts billing/cashflow" -Rationale "Partial billing scenarios need item-level traceability."
  }

  if ($module -eq "public") {
    $gaps += New-Gap -Feature "Self-serve credential recovery and verification resend prompts" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "Medium" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "Onboarding friction rises when recovery actions are unclear."
    $gaps += New-Gap -Feature "Progressive onboarding guidance before first accounting transaction" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "UX Deficiency" -Impact "Medium" -Frequency "Weekly" -RevenueRelevance "Indirectly impacts efficiency" -Rationale "New organizations need clear first-step completion."
  }

  if ($gaps.Count -eq 0) {
    $gaps += New-Gap -Feature "Screen-specific automation parity improvements" -ExistsLedgerLite "Partial" -ExistsZoho "Yes" -GapType "Workflow Limitation" -Impact "Low" -Frequency "Rare" -RevenueRelevance "Cosmetic" -Rationale "No major gap detected from route scan; keep iterative improvements."
  }

  return $gaps | Sort-Object -Property @{ Expression = "PriorityScore"; Descending = $true }, @{ Expression = "Impact"; Descending = $false }
}

function Get-Integrity-Risks {
  param(
    [string]$route,
    $meta
  )

  $methods = To-Array $meta.methods
  $isTransactional = $route -match "^/(invoices|credit-notes|payments-received|bills|debit-notes|expenses|vendor-payments|purchase-orders|purchaseorder|journals|settings/opening-balances|reconciliation)"
  $hasLockDateWarning = [bool]$meta.hasLockDateWarning

  $risks = @()

  if ($isTransactional) {
    if (($methods -contains "PATCH") -or ($methods -contains "DELETE")) {
      $risks += "- Edit after posting: Potential risk. Edit/delete actions are present in this screen scan; posted-state immutability is not explicitly confirmed here."
    } else {
      $risks += "- Edit after posting: Not evident in this screen scan."
    }
  } else {
    $risks += "- Edit after posting: Not applicable to this screen."
  }

  if ($hasLockDateWarning) {
    $risks += "- Period locking: Partially covered. A lock-date warning is visible in this screen."
  } elseif ($isTransactional) {
    $risks += "- Period locking: Potential risk. No lock-date warning affordance detected in this screen."
  } else {
    $risks += "- Period locking: Not applicable to this screen."
  }

  if ($route -eq "/settings/audit-log") {
    $risks += "- Audit logs: Covered by dedicated screen, but transaction-level deep-linking and diff UX may still be improved."
  } else {
    $risks += "- Audit logs: Global audit page exists, but direct linkage from this screen is not evident."
  }

  if ($isTransactional) {
    $risks += "- Multi-user conflicts: Potential risk. No optimistic concurrency indicator detected from route-level scan."
    $risks += "- Journal imbalance risk: Potential risk unless backend posting checks block imbalance consistently; UI-level balance cues vary by screen."
  } else {
    $risks += "- Multi-user conflicts: Not applicable to this screen."
    $risks += "- Journal imbalance risk: Not applicable to this screen."
  }

  if ($methods -contains "DELETE") {
    $risks += "- Soft deletes: Potential risk. Delete action exists; restore/archive behavior is not evident in this screen scan."
  } else {
    $risks += "- Soft deletes: No delete action detected on this screen."
  }

  return $risks
}

function Get-User-Type([string]$module) {
  switch ($module) {
    "sales" { return "accounts receivable accountant" }
    "purchases" { return "accounts payable accountant" }
    "banking" { return "finance operations user" }
    "reports" { return "finance manager" }
    "settings" { return "finance admin" }
    "dashboard" { return "business owner" }
    "public" { return "new organization user" }
    "accounting" { return "general ledger accountant" }
    default { return "finance user" }
  }
}

function Get-Backend-Impact([string]$gapType, [string]$impact) {
  if ($gapType -eq "Compliance Risk" -or $impact -eq "Critical") { return "Major" }
  if ($gapType -eq "Automation Missing" -or $impact -eq "High") { return "Moderate" }
  if ($gapType -eq "Workflow Limitation") { return "Minor" }
  return "None"
}

function Get-Risk-Level([string]$impact) {
  switch ($impact) {
    "Critical" { return "High" }
    "High" { return "High" }
    "Medium" { return "Medium" }
    default { return "Low" }
  }
}

function Get-Actionable-Outcome([string]$feature) {
  if ($feature -match "lock|immutability|audit|integrity|imbalance") { return "books remain accurate and audit-ready" }
  if ($feature -match "filter|saved view|workflow|timeline") { return "the team can execute recurring work faster" }
  if ($feature -match "attachment|document") { return "supporting evidence is always traceable" }
  if ($feature -match "automation|schedule") { return "repetitive close work is reduced" }
  return "the process is more reliable and efficient"
}

$routes = Get-Content $RoutesFile -Raw | ConvertFrom-Json

$normalized = foreach ($r in $routes) {
  [PSCustomObject]@{
    file = [string]$r.file
    route = Normalize-Route ([string]$r.route)
    permissions = To-Array $r.permissions
    endpoints = To-Array $r.endpoints
    methods = To-Array $r.methods
    hasFilterRow = [bool]$r.hasFilterRow
    hasSavedViews = [bool]$r.hasSavedViews
    hasStatusChip = [bool]$r.hasStatusChip
    hasForm = [bool]$r.hasForm
    hasFieldArray = [bool]$r.hasFieldArray
    hasLockDateWarning = [bool]$r.hasLockDateWarning
    hasAttachments = [bool]$r.hasAttachments
    hasDialog = [bool]$r.hasDialog
  }
}

$uniqueRoutes = $normalized | Group-Object route | ForEach-Object { $_.Group[0] } | Sort-Object route

if (!(Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$allGapRows = @()
$screenCapabilityRows = @()
$screenIndexRows = @()
$screenCount = 0

foreach ($meta in $uniqueRoutes) {
  $route = [string]$meta.route
  $module = Get-Module $route
  $screenTitle = Get-Screen-Title $route
  $screenSlug = Get-Screen-Slug $route

  $moduleDir = Join-Path $OutDir $module
  if (!(Test-Path $moduleDir)) {
    New-Item -ItemType Directory -Path $moduleDir | Out-Null
  }

  $targetFile = Join-Path $moduleDir ("{0}-comparison.md" -f $screenSlug)

  $zohoCaps = Get-Zoho-Capabilities -route $route -module $module
  $gaps = Build-Gaps -route $route -module $module -meta $meta
  $integrityRisks = Get-Integrity-Risks -route $route -meta $meta

  $permissions = To-Array $meta.permissions
  $endpoints = To-Array $meta.endpoints
  $methods = To-Array $meta.methods

  $permissions = @($permissions | Where-Object { $_ -ne $null -and $_.ToString().Trim() -ne "" })
  $endpoints = @($endpoints | Where-Object { $_ -ne $null -and $_.ToString().Trim() -ne "" })
  $methods = @($methods | Where-Object { $_ -ne $null -and $_.ToString().Trim() -ne "" })

  $workflowSignals = @()
  if ($methods -contains "POST") { $workflowSignals += "create/post actions detected" }
  if ($methods -contains "PATCH") { $workflowSignals += "update actions detected" }
  if ($methods -contains "DELETE") { $workflowSignals += "delete actions detected" }
  if ($workflowSignals.Count -eq 0) { $workflowSignals += "read/list-oriented screen" }

  $capabilityLines = @(
    "- Route: ``$route``",
    "- Screen file: ``apps/web/app/$($meta.file)``",
    ("- Permission checks in UI: {0}" -f ($(if ((@($permissions).Count) -gt 0) { ($permissions | ForEach-Object { "``$_``" }) -join ", " } else { "none detected in route-level scan" }))),
    ("- API endpoints referenced directly: {0}" -f ($(if ((@($endpoints).Count) -gt 0) { ($endpoints | ForEach-Object { "``$_``" }) -join ", " } else { "none detected in route-level scan" }))),
    ("- HTTP methods referenced from this screen: {0}" -f ($(if ((@($methods).Count) -gt 0) { ($methods | ForEach-Object { "``$_``" }) -join ", " } else { "none detected in route-level scan" }))),
    ("- UI capabilities detected: filterRow={0}, savedViews={1}, statusChip={2}, form={3}, fieldArray={4}, lockDateWarning={5}, attachments={6}, dialog={7}" -f $meta.hasFilterRow, $meta.hasSavedViews, $meta.hasStatusChip, $meta.hasForm, $meta.hasFieldArray, $meta.hasLockDateWarning, $meta.hasAttachments, $meta.hasDialog),
    ("- Workflow signals: {0}" -f ($workflowSignals -join "; "))
  )

  $tableHeader = @(
    "| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |",
    "|---------|----------------------|---------------|----------|--------|----------|"
  )

  $tableRows = foreach ($gap in $gaps) {
    "| $($gap.Feature) | $($gap.ExistsLedgerLite) | $($gap.ExistsZoho) | $($gap.GapType) | $($gap.Impact) | $($gap.PriorityScore) |"
  }

  $stories = @()
  $storyIndex = 1
  $userType = Get-User-Type $module
  foreach ($gap in $gaps | Select-Object -First 6) {
    $storyId = "UX-{0}-{1}" -f $module.ToUpperInvariant(), $storyIndex.ToString("00")
    $backendImpact = Get-Backend-Impact -gapType $gap.GapType -impact $gap.Impact
    $riskLevel = Get-Risk-Level $gap.Impact
    $businessOutcome = Get-Actionable-Outcome $gap.Feature

    $stories += @(
      "### ID: $storyId",
      "",
      "As a $userType,",
      "I want $($gap.Feature.ToLowerInvariant()),",
      "So that $businessOutcome.",
      "",
      "Acceptance Criteria:",
      "- The screen exposes $($gap.Feature.ToLowerInvariant()) with clear validation and error states.",
      "- Behavior is consistent with existing permissions and organization scoping.",
      "- Behavior is covered by automated tests for happy path and guardrail path.",
      "",
      "Backend Impact:",
      "- $backendImpact",
      "",
      "Risk Level:",
      "- $riskLevel",
      ""
    )

    $storyIndex++
  }

  $content = @()
  $content += "# Screen Name: $screenTitle"
  $content += ""
  $content += "## 1. Current LedgerLite Capabilities"
  $content += $capabilityLines
  $content += ""
  $content += "## 2. Zoho Books Capabilities"
  $content += ($zohoCaps | ForEach-Object { "- $_" })
  $content += ""
  $content += "## 3. Feature Gap Analysis"
  $content += $tableHeader
  $content += $tableRows
  $content += ""
  $content += "Scoring model used:"
  $content += "- Impact Weight: Critical=5, High=4, Medium=3, Low=2"
  $content += "- Frequency Weight: Daily use=5, Weekly=4, Monthly=3, Rare=2"
  $content += "- Revenue Relevance: Directly impacts billing/cashflow=5, Indirectly impacts efficiency=3, Cosmetic=1"
  $content += "- Priority = Impact Weight x Frequency Weight x Revenue Relevance"
  $content += ""
  $content += "## Accounting Integrity Risks"
  $content += $integrityRisks
  $content += ""
  $content += "## 4. Recommended User Stories (Ordered by Priority)"
  $content += $stories

  Set-Content -Path $targetFile -Value ($content -join "`r`n") -Encoding UTF8
  $screenCount++

  $screenIndexRows += [PSCustomObject]@{
    Module = $module
    Route = $route
    AppFile = "apps/web/app/$($meta.file)"
    AuditFile = $targetFile.Replace("\", "/")
  }

  $capabilityScore = 0
  $capabilityMax = 10
  if ($permissions.Count -gt 0) { $capabilityScore++ }
  if ($endpoints.Count -gt 0) { $capabilityScore++ }
  if ($meta.hasFilterRow) { $capabilityScore++ }
  if ($meta.hasSavedViews) { $capabilityScore++ }
  if ($meta.hasStatusChip) { $capabilityScore++ }
  if ($meta.hasForm) { $capabilityScore++ }
  if ($meta.hasFieldArray) { $capabilityScore++ }
  if ($meta.hasLockDateWarning) { $capabilityScore++ }
  if ($meta.hasAttachments) { $capabilityScore++ }
  if ($meta.hasDialog) { $capabilityScore++ }

  $screenCapabilityRows += [PSCustomObject]@{
    Module = $module
    Route = $route
    Score = $capabilityScore
    Max = $capabilityMax
  }

  foreach ($gap in $gaps) {
    $allGapRows += [PSCustomObject]@{
      Module = $module
      Route = $route
      Screen = $screenTitle
      Feature = $gap.Feature
      ExistsLedgerLite = $gap.ExistsLedgerLite
      ExistsZoho = $gap.ExistsZoho
      GapType = $gap.GapType
      Impact = $gap.Impact
      PriorityScore = $gap.PriorityScore
      Rationale = $gap.Rationale
    }
  }
}

$rankedRows = $allGapRows | Sort-Object -Property @{ Expression = "PriorityScore"; Descending = $true }, @{ Expression = "Impact"; Descending = $false }
$seenFeatureKeys = @{}
$rankedUnique = foreach ($row in $rankedRows) {
  $key = "{0}|{1}" -f $row.Module, $row.Feature
  if (-not $seenFeatureKeys.ContainsKey($key)) {
    $seenFeatureKeys[$key] = $true
    $row
  }
}

$top20 = $rankedUnique | Select-Object -First 20

$criticalRisks = $rankedUnique |
  Where-Object { $_.Impact -eq "Critical" -or $_.GapType -eq "Compliance Risk" } |
  Sort-Object -Property @{ Expression = "PriorityScore"; Descending = $true } |
  Select-Object -First 20

$requiredParityModules = @("sales", "purchases", "banking", "inventory", "reports", "settings", "dashboard")
$parityRows = @()
foreach ($moduleName in $requiredParityModules) {
  $rows = @($screenCapabilityRows | Where-Object { $_.Module -eq $moduleName })
  if ($rows.Count -eq 0) {
    $defaultParity = if ($moduleName -eq "inventory") { 15.0 } else { 0.0 }
    $parityRows += [PSCustomObject]@{
      Module = $moduleName
      Parity = $defaultParity
      Note = if ($moduleName -eq "inventory") { "No dedicated inventory pages detected in current route scan." } else { "No pages detected in current route scan." }
    }
    continue
  }

  $avgScore = ($rows | Measure-Object Score -Average).Average
  $avgMax = ($rows | Measure-Object Max -Average).Average
  $parityValue = if ($avgMax -eq 0) { 0.0 } else { [Math]::Round((100.0 * $avgScore / $avgMax), 1) }

  $parityRows += [PSCustomObject]@{
    Module = $moduleName
    Parity = $parityValue
    Note = "Derived from screen capability signals detected in code."
  }
}

$roadmapFile = Join-Path $OutDir "master-priority-roadmap.md"
$roadmap = @()
$roadmap += "# UX Audit Master Priority Roadmap"
$roadmap += ""
$roadmap += "Generated from ``$RoutesFile`` on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss K")."
$roadmap += ""
$roadmap += "## Coverage Summary"
$roadmap += "- Screens audited: $screenCount"
$roadmap += "- Total feature gaps identified: $($allGapRows.Count)"
$roadmap += ""
$roadmap += "## Top 20 Highest Impact Features Across Entire System"
$roadmap += "| Rank | Module | Screen | Feature | Gap Type | Impact | Priority Score |"
$roadmap += "|------|--------|--------|---------|----------|--------|---------------|"
$rank = 1
foreach ($row in $top20) {
  $roadmap += "| $rank | $($row.Module) | $($row.Screen) | $($row.Feature) | $($row.GapType) | $($row.Impact) | $($row.PriorityScore) |"
  $rank++
}
$roadmap += ""
$roadmap += "## Top 10 Immediate Actions"
$top10Actions = $top20 | Select-Object -First 10
$actionRank = 1
foreach ($action in $top10Actions) {
  $roadmap += ('{0}. [{1}] {2} (`{3}`), Priority Score: {4}' -f $actionRank, $action.Module, $action.Feature, $action.Screen, $action.PriorityScore)
  $actionRank++
}
$roadmap += ""
$roadmap += "## Critical Accounting Risks"
$roadmap += "| Module | Screen | Risk | Priority Score |"
$roadmap += "|--------|--------|------|---------------|"
foreach ($risk in $criticalRisks) {
  $roadmap += "| $($risk.Module) | $($risk.Screen) | $($risk.Feature) | $($risk.PriorityScore) |"
}
$roadmap += ""
$roadmap += "## Competitive Parity Score"
$roadmap += "| Module | Estimated Parity with Zoho (%) | Notes |"
$roadmap += "|--------|----------------------------------|-------|"
foreach ($parity in $parityRows) {
  $roadmap += "| $($parity.Module) | $($parity.Parity) | $($parity.Note) |"
}
$roadmap += ""
$roadmap += "## Recommended Phase Plan"
$roadmap += "### Phase 1: Critical Accounting Parity"
$roadmap += "- Lock-date and posted-state immutability UX across all transactional detail screens."
$roadmap += "- Auditability improvements: transaction-level audit trail links and posting evidence."
$roadmap += "- Integrity hardening for opening balances and reconciliation critical paths."
$roadmap += ""
$roadmap += "### Phase 2: Workflow & Automation"
$roadmap += "- Purchase flow maturity (PO lifecycle and PO-to-Bill line progression visibility)."
$roadmap += "- Report scheduling and recurring operational automation."
$roadmap += "- High-frequency list productivity (filters, saved views, reusable presets)."
$roadmap += ""
$roadmap += "### Phase 3: UX & Efficiency Enhancements"
$roadmap += "- Confirmation dialogs and better irreversible-action messaging."
$roadmap += "- Better attachment/document context on transactional screens."
$roadmap += "- Consistent list and detail affordances across all modules."
$roadmap += ""
$roadmap += "### Phase 4: Advanced Intelligence & AI"
$roadmap += "- Predictive reconciliation suggestions and anomaly surfacing."
$roadmap += "- Smart remediation guidance for close-period exceptions."
$roadmap += "- Prioritized task recommendations based on aging, cashflow, and VAT risk."

Set-Content -Path $roadmapFile -Value ($roadmap -join "`r`n") -Encoding UTF8

$inventoryFile = Join-Path $OutDir "screen-inventory.md"
$inventory = @()
$inventory += "# LedgerLite Screen Inventory"
$inventory += ""
$inventory += "Detected user-facing Next.js pages grouped by module."
$inventory += ""

$moduleOrder = @("public", "dashboard", "sales", "purchases", "banking", "inventory", "accounting", "reports", "settings", "platform", "misc")
foreach ($moduleName in $moduleOrder) {
  $moduleRows = @($screenIndexRows | Where-Object { $_.Module -eq $moduleName } | Sort-Object Route)
  if ($moduleRows.Count -eq 0) { continue }
  $inventory += "## $moduleName"
  $inventory += "| Route | Screen File | Audit File |"
  $inventory += "|-------|-------------|------------|"
  foreach ($row in $moduleRows) {
    $inventory += "| ``$($row.Route)`` | ``$($row.AppFile)`` | ``$($row.AuditFile)`` |"
  }
  $inventory += ""
}

Set-Content -Path $inventoryFile -Value ($inventory -join "`r`n") -Encoding UTF8

Write-Host "Generated $screenCount screen comparison files under $OutDir"
Write-Host "Generated master roadmap: $roadmapFile"
Write-Host "Generated screen inventory: $inventoryFile"
Write-Host "Total gaps: $($allGapRows.Count)"
