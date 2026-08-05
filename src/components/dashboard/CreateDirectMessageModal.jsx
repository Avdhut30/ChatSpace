import React, { useState } from 'react';
import { Alert, Button, Icon, Modal, SelectPicker } from 'rsuite';
import { useHistory } from 'react-router-dom';
import { useProfile } from '../../context/profile.context';
import { requestRoomsRefresh } from '../../misc/chat-events';
import { useModalState } from '../../misc/custom-hooks';
import { supabase } from '../../misc/supabase';
import { getIdentityLabel } from '../../misc/identity';

async function ensureRoomMember(roomId, userId, isAdmin) {
  const { data, error: lookupError } = await supabase
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (lookupError || data) return lookupError;

  const { error } = await supabase.from('room_members').insert({
    room_id: roomId,
    user_id: userId,
    is_admin: isAdmin,
  });
  return error;
}

const CreateDirectMessageModal = () => {
  const { isOpen, open, close } = useModalState();
  const { profile } = useProfile();
  const history = useHistory();
  const [people, setPeople] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const openPeoplePicker = async () => {
    open();
    setIsLoadingPeople(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, username')
      .neq('id', profile.uid)
      .order('name');

    if (error) {
      Alert.error('Could not load people right now', 4000);
      setPeople([]);
    } else {
      setPeople(
        (data || []).map(person => ({
          label: getIdentityLabel(person),
          value: person.id,
        }))
      );
    }
    setIsLoadingPeople(false);
  };

  const startConversation = async () => {
    if (!selectedPerson || isStarting) return;
    setIsStarting(true);

    let { data: roomId, error } = await supabase.rpc(
      'get_or_create_direct_room',
      { other_user_id: selectedPerson }
    );

    const migrationMissing =
      error &&
      (error.code === 'PGRST202' ||
        error.message?.includes('get_or_create_direct_room'));

    if (migrationMissing) {
      const pairKey = [profile.uid, selectedPerson].sort().join(':');
      const marker = `chatspace-direct:${pairKey}`;
      let createdCompatibleRoom = false;
      const existingResult = await supabase
        .from('rooms')
        .select('id')
        .eq('description', marker)
        .limit(1)
        .maybeSingle();

      if (existingResult.error) {
        error = existingResult.error;
      } else if (existingResult.data) {
        roomId = existingResult.data.id;
        error = null;
      } else {
        const roomResult = await supabase
          .from('rooms')
          .insert({
            name: 'Direct message',
            description: marker,
            created_by: profile.uid,
          })
          .select('id')
          .single();
        roomId = roomResult.data?.id;
        error = roomResult.error;
        createdCompatibleRoom = !error;
      }

      if (!error) {
        error = await ensureRoomMember(
          roomId,
          profile.uid,
          createdCompatibleRoom
        );
      }
      if (!error) {
        error = await ensureRoomMember(roomId, selectedPerson, false);
      }
    }

    if (error) {
      Alert.error(error.message || 'Could not start this direct message', 5000);
      setIsStarting(false);
      return;
    }

    requestRoomsRefresh();
    setSelectedPerson(null);
    setIsStarting(false);
    close();
    history.push(`/chat/${roomId}`);
  };

  return (
    <div className="create-room-action">
      <Button
        block
        className="create-room-button create-room-button--direct"
        onClick={openPeoplePicker}
      >
        <Icon icon="commenting-o" />
        New direct message
      </Button>

      <Modal show={isOpen} onHide={close} className="app-modal" size="xs">
        <Modal.Header>
          <Modal.Title>Start a private conversation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="direct-message-intro">
            Choose someone to open a private chat. Only the two of you can see
            its messages and files.
          </p>
          <SelectPicker
            block
            searchable
            data={people}
            value={selectedPerson}
            onChange={setSelectedPerson}
            loading={isLoadingPeople}
            placeholder="Search for a person"
            aria-label="Choose a person for a direct message"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            block
            appearance="primary"
            onClick={startConversation}
            loading={isStarting}
            disabled={!selectedPerson || isLoadingPeople || isStarting}
          >
            Start chatting
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CreateDirectMessageModal;
