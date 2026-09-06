import { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, state } from "./config.js";

// AmazonCognitoIdentity is loaded globally via the CDN script tag in
// index.html (no bundler in this project, so no npm import here).
function getUserPool() {
  return new AmazonCognitoIdentity.CognitoUserPool({
    UserPoolId: COGNITO_USER_POOL_ID,
    ClientId: COGNITO_CLIENT_ID,
  });
}

// Authenticates against the real Cognito user pool. Resolves with the
// decoded ID token payload (includes cognito:groups for role mapping) and
// stores the raw ID token on shared state for use as the API Authorization
// header. Rejects with the Cognito SDK's own error on bad credentials.
export function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
      Username: email,
      Pool: getUserPool(),
    });

    const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
      Username: email,
      Password: password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        state.idToken = session.getIdToken().getJwtToken();
        resolve(session.getIdToken().decodePayload());
      },
      onFailure: (error) => {
        reject(error);
      },
      newPasswordRequired: () => {
        reject(
          new Error(
            "This account needs a new password set before first sign-in. Contact a manager.",
          ),
        );
      },
    });
  });
}

// Clears the current Cognito session on logout.
export function signOut() {
  const currentUser = getUserPool().getCurrentUser();
  if (currentUser) currentUser.signOut();
  state.idToken = null;
}

// Maps Cognito group membership to the app's UI role. Only the `manager`
// group is provisioned by CDK (FR-01) — anyone authenticated without it is
// treated as staff.
export function roleFromClaims(claims) {
  const groups = claims?.["cognito:groups"] || [];
  return groups.includes("manager") ? "manager" : "staff";
}
