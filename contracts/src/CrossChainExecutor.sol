// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DemoNFT.sol";

/// @notice Executor deployed on secondary chains (e.g. Base Sepolia).
/// Balance deduction happens on the hub chain (Sepolia) by the relayer backend.
/// This contract only handles the on-chain mint on the target chain.
contract CrossChainExecutor is Ownable {
    DemoNFT public immutable nft;

    mapping(address => bool) public relayers;

    event GaslessMintExecuted(address indexed user, uint256 tokenId);

    modifier onlyRelayer() {
        require(relayers[msg.sender], "CrossChainExecutor: not relayer");
        _;
    }

    constructor(address _nft) Ownable(msg.sender) {
        nft = DemoNFT(_nft);
    }

    function setRelayer(address relayer, bool enabled) external onlyOwner {
        relayers[relayer] = enabled;
    }

    /// @notice Called by relayer after deducting fee on hub chain.
    function gaslessMint(address user) external onlyRelayer {
        uint256 tokenId = nft.mint(user);
        emit GaslessMintExecuted(user, tokenId);
    }
}
