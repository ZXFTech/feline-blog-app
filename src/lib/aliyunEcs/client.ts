// This file is auto-generated, don't edit it
// 依赖的模块可通过下载工程中的模块依赖文件或右上角的获取 SDK 依赖信息查看
import Ecs20140526, * as $Ecs20140526 from "@alicloud/ecs20140526";
import * as $OpenApi from "@alicloud/openapi-client";
import Console from "@alicloud/tea-console";
import Util, * as $Util from "@alicloud/tea-util";
import Credential from "@alicloud/credentials";

export default class Client {
  /**
   * @remarks
   * 使用凭据初始化账号Client
   * @returns Client
   *
   * @throws Exception
   */
  static createClient(): Ecs20140526 {
    // 工程代码建议使用更安全的无AK方式，凭据配置方式请参见：https://help.aliyun.com/document_detail/378664.html。
    const credential = new Credential();
    const config = new $OpenApi.Config({
      credential: credential,
    });
    // Endpoint 请参考 https://api.aliyun.com/product/Ecs
    config.endpoint = `ecs.cn-hangzhou.aliyuncs.com`;
    return new Ecs20140526(config);
  }

  static async uploadFiles(): Promise<void> {
    const client = Client.createClient();
    const sendFileRequest = new $Ecs20140526.SendFileRequest({
      regionId: "cn-hangzhou",
      name: "test",
      targetDir: "/root",
      content: "test",
      // Array, 必填, 需要执行命令的ECS实例列表。最多能指定50台ECS实例ID。N的取值范围为1~50。
      instanceId: ["i-bp15crh17ncu5ns6lala"],
    });
    const runtime = new $Util.RuntimeOptions({});
    try {
      const resp = await client.sendFileWithOptions(sendFileRequest, runtime);
      Console.log(Util.toJSONString(resp));
    } catch (error) {
      // 此处仅做打印展示，请谨慎对待异常处理，在工程项目中切勿直接忽略异常。
      // 错误 message
      const typeError = error as {
        message: string;
        data: { [key: string]: string };
      };
      console.log(typeError.message);
      // 诊断地址
      console.log(typeError.data["Recommend"]);
      Util.assertAsString(typeError.message);
    }
  }
}
