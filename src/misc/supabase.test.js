import { describe, expect, it } from 'vitest';
import {
  isAdvancedMessageSchemaError,
  isMissingSchemaColumn,
} from './supabase';

describe('isAdvancedMessageSchemaError', () => {
  it('recognizes missing reply columns reported by PostgREST', () => {
    expect(
      isAdvancedMessageSchemaError({
        message:
          "Could not find the 'reply_to' column of 'messages' in the schema cache",
      })
    ).toBe(true);
  });

  it('recognizes missing edit columns reported by PostgREST', () => {
    expect(
      isAdvancedMessageSchemaError({
        message:
          "Could not find the 'edited_at' column of 'messages' in the schema cache",
      })
    ).toBe(true);
  });

  it('does not hide unrelated database errors', () => {
    expect(
      isAdvancedMessageSchemaError({ message: 'Permission denied' })
    ).toBe(false);
  });

  it('recognizes optional room columns independently', () => {
    expect(
      isMissingSchemaColumn(
        {
          message:
            "Could not find the 'room_type' column of 'rooms' in the schema cache",
        },
        'room_type'
      )
    ).toBe(true);
  });
});
