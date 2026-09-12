import { randomUUID } from "node:crypto";

import { createAction, Property } from "@activepieces/pieces-framework";

import { formFieldProperty, formIdProperty, passgradRequest, moderatorTargetProperty } from "../common";

const sourceParty = Property.StaticDropdown({
  displayName: "Source party",
  required: true,
  options: {
    disabled: false,
    options: [
      { label: "Internal", value: "internal" },
      { label: "External", value: "external" },
    ],
  },
});

const moderatorType = Property.StaticDropdown({
  displayName: "Moderator",
  required: true,
  options: {
    disabled: false,
    options: [
      { label: "Fixed user", value: "fixed_user" },
      { label: "Fixed group", value: "fixed_group" },
      { label: "Submitted Person field", value: "submission_person_field" },
    ],
  },
});

const mappingKeys = ["letter_number_field_id", "letter_date_field_id", "letter_title_field_id", "letter_description_field_id", "letter_attachment_field_id", "sender_field_id", "recipient_field_id", "letter_type_field_id", "note_field_id"];

const precedingMappingKeys = (propertyKey: string) => mappingKeys.slice(0, mappingKeys.indexOf(propertyKey));

const field = (propertyKey: string, displayName: string, types: readonly string[]) =>
  formFieldProperty(displayName, types, {
    excludeKeys: precedingMappingKeys(propertyKey),
    propertyKey,
    requireSingle: true,
  });

const senderField = formFieldProperty("Sender field", ["person", "text"], {
  excludeKeys: precedingMappingKeys("sender_field_id"),
  propertyKey: "sender_field_id",
  requireSingle: true,
  refreshers: ["source_party"],
  compatible: (candidate, propsValue) => (propsValue.source_party === "internal" ? candidate.type === "person" : candidate.type === "text"),
});

export const openPersuratanCase = createAction({
  name: "open_persuratan_case",
  displayName: "Open Persuratan Case",
  description: "Open one replay-safe Persuratan case from a Form submission.",
  props: {
    source_form_id: formIdProperty,
    source_party: sourceParty,
    letter_number_field_id: field("letter_number_field_id", "Letter number field", ["text", "formula"]),
    letter_date_field_id: field("letter_date_field_id", "Letter date field", ["date"]),
    letter_title_field_id: field("letter_title_field_id", "Letter title field", ["text"]),
    letter_description_field_id: field("letter_description_field_id", "Letter description field", ["text", "textarea"]),
    letter_attachment_field_id: field("letter_attachment_field_id", "Formal-letter attachment field", ["attachment"]),
    sender_field_id: senderField,
    recipient_field_id: field("recipient_field_id", "Recipient field", ["person"]),
    letter_type_field_id: field("letter_type_field_id", "Letter type field", ["single_select", "multi_select"]),
    note_field_id: field("note_field_id", "Note field", ["text", "textarea"]),
    moderator_type: moderatorType,
    moderator_target_id: moderatorTargetProperty,
  },
  async run(context) {
    const props = context.propsValue;
    const required = (value: unknown, name: string): string => {
      if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
      return value;
    };
    const moderator = (() => {
      switch (props.moderator_type) {
        case "fixed_user":
          return {
            type: "fixed_user" as const,
            userId: required(props.moderator_target_id, "Moderator user"),
          };
        case "fixed_group":
          return {
            type: "fixed_group" as const,
            groupId: required(props.moderator_target_id, "Moderator group"),
          };
        case "submission_person_field":
          return {
            type: "submission_person_field" as const,
            fieldId: required(props.moderator_target_id, "Moderator field"),
          };
        default:
          throw new Error("Moderator selection is invalid");
      }
    })();
    const response = await passgradRequest<{ data: unknown }>(context, {
      operation: "workflow.open-persuratan-case",
      payload: {
        type: "workflow.persuratan.case.opened.v1",
        eventId: randomUUID(),
        moderator,
        fieldMapping: {
          sourceParty: props.source_party,
          letterNumberFieldId: required(props.letter_number_field_id, "Letter number field"),
          letterDateFieldId: required(props.letter_date_field_id, "Letter date field"),
          letterTitleFieldId: required(props.letter_title_field_id, "Letter title field"),
          letterDescriptionFieldId: required(props.letter_description_field_id, "Letter description field"),
          letterAttachmentFieldId: required(props.letter_attachment_field_id, "Letter attachment field"),
          senderFieldId: required(props.sender_field_id, "Sender field"),
          recipientFieldId: required(props.recipient_field_id, "Recipient field"),
          letterTypeFieldId: required(props.letter_type_field_id, "Letter type field"),
          noteFieldId: required(props.note_field_id, "Note field"),
        },
      },
    });
    return response.data;
  },
});
