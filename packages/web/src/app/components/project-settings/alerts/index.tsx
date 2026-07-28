import { ProjectType } from '@activepieces/shared';

import { PersonalProjectAlerts } from './personal-project-alerts';
import { TeamProjectAlerts } from './team-project-alerts';

import { projectCollectionUtils } from '@/features/projects';

export const AlertsSettings = () => {
  const { project: currentProject } =
    projectCollectionUtils.useCurrentProject();

  if (currentProject?.type === ProjectType.PERSONAL) {
    return <PersonalProjectAlerts />;
  }

  return <TeamProjectAlerts />;
};
