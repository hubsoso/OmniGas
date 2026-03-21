// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./GasVault.sol";
import "./DemoNFT.sol";

contract DemoExecutor is Ownable {
    GasVault public immutable vault;
    DemoNFT public immutable nft;

    mapping(address => bool) public relayers;

    // 每个 token 的固定扣费（owner 配置）
    // USDC (6 decimals): 100_000 = 0.1 USDC
    // BOX  (18 decimals): 1e17   = 0.1 BOX
    mapping(address => uint256) public fees;

    mapping(address => uint256) public nonces;

    event GaslessMintExecuted(address indexed user, address indexed feeToken, uint256 fee, uint256 tokenId);

    modifier onlyRelayer() {
        require(relayers[msg.sender], "DemoExecutor: not relayer");
        _;
    }

    constructor(address _vault, address _nft) Ownable(msg.sender) {
        vault = GasVault(_vault);
        nft = DemoNFT(_nft);
    }

    function setRelayer(address relayer, bool enabled) external onlyOwner {
        relayers[relayer] = enabled;
    }

    // 配置某 token 的扣费金额
    function setFee(address token, uint256 amount) external onlyOwner {
        fees[token] = amount;
    }

    // Version S：relayer 直接调用，指定用哪个 token 付费
    function gaslessMint(address user, address feeToken) external onlyRelayer {
        uint256 fee = fees[feeToken];
        require(fee > 0, "DemoExecutor: fee not configured for token");
        vault.deduct(feeToken, user, fee);
        uint256 tokenId = nft.mint(user);
        emit GaslessMintExecuted(user, feeToken, fee, tokenId);
    }

    // Version A：带用户签名
    function gaslessMintWithSig(
        address user,
        address feeToken,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelayer {
        require(block.timestamp <= deadline, "DemoExecutor: expired");
        require(nonces[user] == nonce, "DemoExecutor: invalid nonce");

        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(user, feeToken, nonce, deadline, address(this)))
        ));
        require(_recoverSigner(hash, signature) == user, "DemoExecutor: invalid signature");

        nonces[user]++;
        uint256 fee = fees[feeToken];
        require(fee > 0, "DemoExecutor: fee not configured for token");
        vault.deduct(feeToken, user, fee);
        uint256 tokenId = nft.mint(user);
        emit GaslessMintExecuted(user, feeToken, fee, tokenId);
    }

    function _recoverSigner(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(hash, v, r, s);
    }
}
