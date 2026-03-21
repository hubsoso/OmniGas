// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DemoNFT is ERC721, Ownable {
    uint256 public nextTokenId;

    mapping(address => bool) public minters;

    event Minted(address indexed to, uint256 tokenId);

    modifier onlyMinter() {
        require(minters[msg.sender], "DemoNFT: not minter");
        _;
    }

    constructor() ERC721("OmniGas Demo NFT", "OGDEMO") Ownable(msg.sender) {}

    function setMinter(address minter, bool enabled) external onlyOwner {
        minters[minter] = enabled;
    }

    function mint(address to) external onlyMinter returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        emit Minted(to, tokenId);
        return tokenId;
    }
}
