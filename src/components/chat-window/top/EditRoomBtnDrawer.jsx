import React, { memo, useState } from 'react';
import { useParams } from 'react-router';
import { Alert, Button, CheckPicker, Drawer, Icon } from 'rsuite';
import { useCurrentRoom } from '../../../context/current-room.context';
import { useMediaQuery, useModalState } from '../../../misc/custom-hooks';
import { supabase } from '../../../misc/supabase';
import { useProfile } from '../../../context/profile.context';
import EditableInput from '../../EditableInput';
import { getIdentityLabel } from '../../../misc/identity';

const EditRoomBtnDrawer = () => {
  const { isOpen, close, open } = useModalState();
  const { chatId } = useParams();
  const { profile } = useProfile();
  const isMobile = useMediaQuery('(max-width: 992px)');
  const [memberOptions, setMemberOptions] = useState([]);
  const [members, setMembers] = useState([]);
  const [savedMembers, setSavedMembers] = useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSavingMembers, setIsSavingMembers] = useState(false);

  const name = useCurrentRoom(v => v.name);
  const description = useCurrentRoom(v => v.description);

  const openEditor = async () => {
    open();
    setIsLoadingMembers(true);
    const [{ data: profiles }, { data: memberships }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, username')
        .neq('id', profile.uid)
        .order('name'),
      supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', chatId)
        .neq('user_id', profile.uid),
    ]);
    const selected = (memberships || []).map(member => member.user_id);
    setMemberOptions(
      (profiles || []).map(member => ({
        label: getIdentityLabel(member),
        value: member.id,
      }))
    );
    setMembers(selected);
    setSavedMembers(selected);
    setIsLoadingMembers(false);
  };

  const saveMembers = async () => {
    const added = members.filter(userId => !savedMembers.includes(userId));
    const removed = savedMembers.filter(userId => !members.includes(userId));
    if (!added.length && !removed.length) return;

    setIsSavingMembers(true);
    const results = [];
    if (added.length) {
      results.push(
        await supabase.from('room_members').insert(
          added.map(userId => ({
            room_id: chatId,
            user_id: userId,
            is_admin: false,
          }))
        )
      );
    }
    if (removed.length) {
      results.push(
        await supabase
          .from('room_members')
          .delete()
          .eq('room_id', chatId)
          .in('user_id', removed)
      );
    }

    const error = results.find(result => result.error)?.error;
    if (error) {
      Alert.error(error.message, 4000);
    } else {
      setSavedMembers(members);
      Alert.success('Group members updated', 3000);
    }
    setIsSavingMembers(false);
  };

  const updateData = async (key, value) => {
    const column = key === 'name' ? 'name' : 'description';
    const { error } = await supabase
      .from('rooms')
      .update({ [column]: value })
      .eq('id', chatId);

    if (error) {
      Alert.error(error.message, 4000);
    } else {
      Alert.success('Successfully updated', 4000);
    }
  };

  const onNameSave = newName => {
    updateData('name', newName);
  };
  const onDescriptionSave = newDesc => {
    updateData('description', newDesc);
  };

  return (
    <div>
      <Button
        className="chat-action-button"
        size="sm"
        onClick={openEditor}
        title="Edit room"
      >
        <Icon icon="edit2" />
      </Button>

      <Drawer full={isMobile} show={isOpen} onHide={close} placement="right">
        <Drawer.Header>
          <Drawer.Title>Edit Room</Drawer.Title>
        </Drawer.Header>

        <Drawer.Body>
          <EditableInput
            initialValue={name}
            onSave={onNameSave}
            label={<h6 className="mb-2">Name</h6>}
            EmptyMsg="Name can not be empty"
          />
          <EditableInput
            componentClass="textarea"
            rows={5}
            initialValue={description}
            onSave={onDescriptionSave}
            EmptyMsg="Description can not be empty"
            wrapperClassName="mt-3"
          />
          <div className="group-members-editor">
            <h6>Group members</h6>
            <p>You are included as the group administrator.</p>
            <CheckPicker
              block
              searchable
              data={memberOptions}
              value={members}
              onChange={setMembers}
              loading={isLoadingMembers}
              placeholder="Choose group members"
            />
            <Button
              block
              appearance="primary"
              className="mt-2"
              onClick={saveMembers}
              loading={isSavingMembers}
              disabled={isLoadingMembers || isSavingMembers}
            >
              Save members
            </Button>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Button block onClick={close}>
            Close
          </Button>
        </Drawer.Footer>
      </Drawer>
    </div>
  );
};

export default memo(EditRoomBtnDrawer);
