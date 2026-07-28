import { Project } from '@activepieces/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

export type PassgradProjectBindingSchema = {
    id: string
    created: Date
    updated: Date
    projectId: string
    provisioningKey: string
    tenantId: string
    credentials: EncryptedObject
    project?: Project
}

export const PassgradProjectBindingEntity = new EntitySchema<PassgradProjectBindingSchema>({
    name: 'passgrad_project_binding',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...ApIdSchema,
            nullable: false,
        },
        tenantId: {
            type: String,
            nullable: false,
        },
        provisioningKey: {
            type: String,
            nullable: false,
        },
        credentials: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_passgrad_project_binding_project_id',
            columns: ['projectId'],
            unique: true,
        },
        {
            name: 'idx_passgrad_project_binding_tenant_id',
            columns: ['tenantId'],
            unique: true,
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_passgrad_project_binding_project_id',
            },
        },
    },
})
