import React from 'react';
import { Modal } from 'rsuite';
import { useModalState } from '../../../misc/custom-hooks';

const ImgBtnModal = ({ src, fileName }) => {
  const { isOpen, open, close } = useModalState();
  return (
    <div>
      <>
        <button
          type="button"
          className="attachment-image-button"
          onClick={open}
          aria-label={`Open ${fileName || 'image'}`}
        >
          <img src={src} alt={fileName || 'Shared image'} loading="lazy" />
        </button>
        <Modal show={isOpen} onHide={close} className="app-modal">
          <Modal.Header>
            <Modal.Title>{fileName}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div>
              <img
                src={src}
                height="100%"
                width="100%"
                alt={fileName || 'Shared image'}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <a href={src} target="_blank" rel="noopener noreferrer">
              View original / download
            </a>
          </Modal.Footer>
        </Modal>
      </>
    </div>
  );
};

export default ImgBtnModal;
