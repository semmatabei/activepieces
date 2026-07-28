import { ProjectReleaseType } from '@activepieces/shared';
import { ReactNode, useState } from 'react';

import { Button, ButtonProps } from '@/components/ui/button';

import { ProjectSelectionDialog } from './selection-release-dialog/project-dialog';

import { projectCollectionUtils } from '@/features/projects';

type SelectionButtonProps = ButtonProps & {
  ReleaseType: ProjectReleaseType;
  children: ReactNode;
  onSuccess: () => void;
};
export function SelectionButton({
  ReleaseType,
  children,
  onSuccess,
  ...props
}: SelectionButtonProps) {
  const { project } = projectCollectionUtils.useCurrentProject();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        {...props}
        onClick={() => {
          setOpen(true);
        }}
      >
        {children}
      </Button>
      {ReleaseType === ProjectReleaseType.PROJECT && (
        <ProjectSelectionDialog
          open={open}
          setOpen={setOpen}
          projectId={project.id}
          onSuccess={onSuccess}
        />
      )}
    </>
  );
}
