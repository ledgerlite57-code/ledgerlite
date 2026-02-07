# 34 - Public Pages (Zoho-Style) Flow User Stories

## Purpose
Define public/unauthenticated user stories that mimic Zoho Books' public flow (signup, login, recovery, and invitation acceptance).

## User Stories

### PUB-01 - Trial Signup With Zoho-Style Fields
As a new visitor,  
I want a simple trial signup page,  
So that I can start using the product quickly.

Acceptance Criteria
- Signup can start a 14-day free trial. citeturn2search11
- Signup fields include Company Name, Email Address, Password, Country, and State. citeturn2search9
- Mobile Number appears only for regions where it is required. citeturn2search9
- The signup CTA is reachable from the Zoho Books home page flow (Sign Up Now). citeturn2search9

### PUB-02 - Country Selection Sets Base Currency (With Locks)
As a new organization owner,  
I want the base currency to be set based on my location during signup,  
So that reporting is consistent from day one.

Acceptance Criteria
- Base currency is determined by the country/location chosen at signup. citeturn2search0turn2search4
- For specific locations, the base currency cannot be changed. citeturn2search0
- The UI warns users when they are selecting a locked-location currency. citeturn2search0

### PUB-03 - Login With Optional MFA
As a returning user,  
I want to log in with my account and complete MFA if enabled,  
So that my account is secure.

Acceptance Criteria
- Login uses a single Zoho-style account sign-in (SSO concept across services). citeturn1search4
- If MFA is enabled, the login flow requires verification. citeturn1search4
- Supported MFA modes include OneAuth, OTP Authenticator, Security Key, and Passkey. citeturn1search4

### PUB-04 - Forgot Password (Email + Captcha)
As a user who forgot my password,  
I want a reset flow that verifies I’m the account owner,  
So that I can regain access safely.

Acceptance Criteria
- Forgot Password asks for registered email and a captcha. citeturn1search0
- A reset link is sent to the registered email. citeturn1search0
- The user can set a new password from the reset link. citeturn1search0

### PUB-05 - Invite Acceptance for Team Members
As an invited team member,  
I want to accept an invite and set a password,  
So that I can access the organization.

Acceptance Criteria
- Admin invites users by email and role. citeturn1search11
- Invited users receive an email with a verification link. citeturn1search11
- Invited users set a login password to access the organization. citeturn1search11

### PUB-06 - Customer Portal Invite Acceptance
As a customer invited to the portal,  
I want to accept the invitation and set a password,  
So that I can access the portal and interact with documents.

Acceptance Criteria
- The invite email includes the portal URL and the customer’s username. citeturn1search13
- Accept Invitation leads to a signup page where the customer sets a password. citeturn1search13
- After setting a password, the customer lands on the portal home page. citeturn1search13
- Reinvite is available if the customer missed the email. citeturn1search13
