import React, { useState, useCallback, useRef } from 'react';
import {
  Button,
  Icon,
  Modal,
  Form,
  FormGroup,
  ControlLabel,
  FormControl,
  Schema,
  Alert,
  CheckPicker,
} from 'rsuite';
import { useProfile } from '../../context/profile.context';
import { useModalState } from '../../misc/custom-hooks';
import { isMissingSchemaColumn, supabase } from '../../misc/supabase';
import { getIdentityLabel } from '../../misc/identity';

const { StringType } = Schema.Types;

const model = Schema.Model({
  name: StringType().isRequired('Chat name is required'),
  description: StringType().isRequired('Description is required'),
});

const INITIAL_FORM = {
  name: '',
  description: '',
};

const CreateRoomBtnModal = () => {
  const { isOpen, open, close } = useModalState();
  const { profile } = useProfile();

  const [formValue, setFormValue] = useState(INITIAL_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const formRef = useRef();

  const onFormChange = useCallback(value => {
    setFormValue(value);
  }, []);

  const openCreateGroup = async () => {
    open();
    setIsLoadingMembers(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, username')
      .neq('id', profile.uid)
      .order('name');

    if (error) {
      Alert.error('Could not load people for this group', 4000);
      setMemberOptions([]);
    } else {
      setMemberOptions(
        (data || []).map(member => ({
          label: getIdentityLabel(member),
          value: member.id,
        }))
      );
    }
    setIsLoadingMembers(false);
  };

  const onSubmit = async () => {
    if (!formRef.current.check()) {
      Alert.info('Returned', 4000);
      return;
    }

    setIsLoading(true);

    try {
      let { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: formValue.name,
          description: formValue.description,
          created_by: profile.uid,
          room_type: 'group',
        })
        .select('id')
        .single();

      if (isMissingSchemaColumn(roomError, 'room_type')) {
        const legacyResult = await supabase
          .from('rooms')
          .insert({
            name: formValue.name,
            description: formValue.description,
            created_by: profile.uid,
          })
          .select('id')
          .single();
        room = legacyResult.data;
        roomError = legacyResult.error;
      }

      if (roomError) throw roomError;

      const { error: memberError } = await supabase
        .from('room_members')
        .upsert(
          { room_id: room.id, user_id: profile.uid, is_admin: true },
          { onConflict: 'room_id,user_id' }
        );

      if (memberError) throw memberError;

      if (selectedMembers.length) {
        const { error: inviteError } = await supabase
          .from('room_members')
          .insert(
            selectedMembers.map(userId => ({
              room_id: room.id,
              user_id: userId,
              is_admin: false,
            }))
          );
        if (inviteError) throw inviteError;
      }

      Alert.success(`${formValue.name} has been created`, 4000);
      setIsLoading(false);
      setFormValue(INITIAL_FORM);
      setSelectedMembers([]);
      close();
    } catch (err) {
      setIsLoading(false);
      Alert.error(err.message, 4000);
    }
  };

  return (
    <div className="create-room-action">
      <Button block className="create-room-button" onClick={openCreateGroup}>
        <Icon icon="plus" />
        New group chat
      </Button>

      <Modal show={isOpen} onHide={close} className="app-modal">
        <Modal.Header>
          <Modal.Title>Create a group chat</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form
            fluid
            onChange={onFormChange}
            formValue={formValue}
            model={model}
            ref={formRef}
          >
            <FormGroup>
              <ControlLabel>Room name</ControlLabel>
              <FormControl name="name" placeholder="Enter chat room name..." />
            </FormGroup>
            <FormGroup>
              <ControlLabel>Add people</ControlLabel>
              <CheckPicker
                block
                searchable
                data={memberOptions}
                value={selectedMembers}
                onChange={setSelectedMembers}
                loading={isLoadingMembers}
                placeholder="Choose group members"
                aria-label="Choose group members"
              />
              <p className="group-member-hint">
                You are the group admin. You can add more people later.
              </p>
            </FormGroup>

            <FormGroup>
              <ControlLabel>Description</ControlLabel>
              <FormControl
                componentClass="textarea"
                rows={5}
                name="description"
                placeholder="Enter room description "
              />
            </FormGroup>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            block
            appearance="primary"
            onClick={onSubmit}
            disabled={isLoading}
          >
            Create group chat
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CreateRoomBtnModal;
