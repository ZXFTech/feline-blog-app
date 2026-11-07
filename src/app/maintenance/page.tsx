import { AuthFrame } from "@/components/Auth/AuthFrame";
export default function Maintenance() {
  return (
    <AuthFrame title="业务维护中">
      <p role="status">暂时无法访问业务内容。你仍可登录、检查账号或完成允许的资料确认。</p>
    </AuthFrame>
  );
}
