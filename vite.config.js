import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN;
  const sentryOrg = env.SENTRY_ORG;
  const sentryProject = env.SENTRY_PROJECT;
  const sentryUploadEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

  return {
    build: {
      // Generate source maps for Sentry without advertising them publicly in
      // built asset comments. The plugin can then upload and remove them.
      sourcemap: 'hidden'
    },
    plugins: sentryUploadEnabled
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            telemetry: false,
            sourcemaps: {
              filesToDeleteAfterUpload: ['dist/**/*.js.map', 'dist/**/*.css.map']
            }
          })
        ]
      : []
  };
});
