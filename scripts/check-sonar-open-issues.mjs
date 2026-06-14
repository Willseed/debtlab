const projectKey = process.env.SONAR_PROJECT_KEY ?? 'Willseed_debtlab';
const sonarToken = process.env.SONAR_TOKEN;
const pageSize = 100;

const issues = [];
let page = 1;
let total = 0;

do {
  const url = new URL('https://sonarcloud.io/api/issues/search');
  url.searchParams.set('componentKeys', projectKey);
  url.searchParams.set('issueStatuses', 'OPEN');
  url.searchParams.set('p', String(page));
  url.searchParams.set('ps', String(pageSize));

  const response = await fetch(url, {
    headers: sonarToken
      ? {
          Authorization: `Bearer ${sonarToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`SonarCloud open issue check failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  total = Number(payload.total ?? 0);
  issues.push(...(Array.isArray(payload.issues) ? payload.issues : []));
  page += 1;
} while (issues.length < total);

if (total > 0) {
  console.error(`SonarCloud has ${total} open issue(s) for ${projectKey}. Deployment is blocked.`);

  for (const issue of issues.slice(0, 20)) {
    const component = String(issue.component ?? '').replace(`${projectKey}:`, '');
    const line = issue.line ? `:${issue.line}` : '';
    console.error(`- ${issue.rule} ${component}${line} ${issue.message}`);
  }

  if (total > 20) {
    console.error(`- ...and ${total - 20} more open issue(s).`);
  }

  process.exitCode = 1;
} else {
  console.log(`SonarCloud has no open issues for ${projectKey}.`);
}
