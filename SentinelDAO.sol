// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19; 

contract SentinelDAO {
    
    address public owner;
    uint256 public caseCount;

    struct ModerationCase {
        bytes32 messageHash;
        address offender;
        address[3] moderators;
        uint8 voteCount;
        bool resolved;
        uint8 decision; // 0 = pending, 1 = punished, 2 = dismissed
        uint256 createdAt;
    }

    mapping(uint256 => ModerationCase) public cases;
    mapping(uint256 => mapping(address => uint8)) public votes; 
    // votes: 0 = not voted, 1 = punish, 2 = dismiss

    event CaseCreated(
        uint256 indexed caseId, 
        bytes32 messageHash, 
        address offender, 
        address[3] moderators
    );
    
    event VoteCast(
        uint256 indexed caseId, 
        address indexed moderator, 
        uint8 decision
    );
    
    event CaseResolved(
        uint256 indexed caseId, 
        uint8 decision
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        caseCount = 0;
    }

    function createCase(
        bytes32 _messageHash,
        address _offender,
        address[3] memory _moderators
    ) external onlyOwner returns (uint256) {
        
        uint256 caseId = caseCount;
        
        ModerationCase storage newCase = cases[caseId];
        newCase.messageHash = _messageHash;
        newCase.offender = _offender;
        newCase.moderators = _moderators;
        newCase.voteCount = 0;
        newCase.resolved = false;
        newCase.decision = 0;
        newCase.createdAt = block.timestamp;

        caseCount++;

        emit CaseCreated(caseId, _messageHash, _offender, _moderators);
        
        return caseId;
    }

    function castVote(uint256 _caseId, uint8 _decision) external {
        
        ModerationCase storage modCase = cases[_caseId];
        
        require(!modCase.resolved, "Case already resolved");
        require(_decision == 1 || _decision == 2, "Invalid decision");
        require(votes[_caseId][msg.sender] == 0, "Already voted");
        
        // verify caller is one of the 3 moderators
        bool isModerator = false;
        for (uint8 i = 0; i < 3; i++) {
            if (modCase.moderators[i] == msg.sender) {
                isModerator = true;
                break;
            }
        }
        require(isModerator, "Not a moderator for this case");

        votes[_caseId][msg.sender] = _decision;
        modCase.voteCount++;

        emit VoteCast(_caseId, msg.sender, _decision);

        if (modCase.voteCount == 3) {
            _resolveCase(_caseId);
        }
    }

    function _resolveCase(uint256 _caseId) internal {
        
        ModerationCase storage modCase = cases[_caseId];
        
        uint8 punishVotes = 0;
        for (uint8 i = 0; i < 3; i++) {
            if (votes[_caseId][modCase.moderators[i]] == 1) {
                punishVotes++;
            }
        }

        if (punishVotes >= 2) {
            modCase.decision = 1; // punished
        } else {
            modCase.decision = 2; // dismissed
        }

        modCase.resolved = true;

        emit CaseResolved(_caseId, modCase.decision);
    }

    function getCase(uint256 _caseId) external view returns (
        bytes32 messageHash,
        address offender,
        address[3] memory moderators,
        uint8 voteCount,
        bool resolved,
        uint8 decision,
        uint256 createdAt
    ) {
        ModerationCase storage modCase = cases[_caseId];
        return (
            modCase.messageHash,
            modCase.offender,
            modCase.moderators,
            modCase.voteCount,
            modCase.resolved,
            modCase.decision,
            modCase.createdAt
        );
    }

    function getVote(uint256 _caseId, address _moderator) external view returns (uint8) {
        return votes[_caseId][_moderator];
    }

    function getModerators(uint256 _caseId) external view returns (address[3] memory) {
        return cases[_caseId].moderators;
    }
}